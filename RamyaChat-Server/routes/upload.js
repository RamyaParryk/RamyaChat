// 画像・ファイル・音声アップロード
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
// 👇 もし環境変数が空っぽでも、右側のURLが必ず使われる
const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://chat.tomato-juice.biz';

// 🌟 画像専用のフィルターを作成（アバターとチャット画像で共用）
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true); // 画像ならOK
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', '画像以外のファイルはアップロードできません'));
  }
};

/* ================================
   Avatar Upload
================================ */
const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const userId = req.body.userId || 'unknown';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 🌟 アバターアップロードに画像フィルターを適用！
const upload = multer({ storage: storage, fileFilter: imageFilter });

// エラーを綺麗にキャッチできるように修正
router.post('/upload-avatar', (req, res) => {
  upload.single('avatar')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
    
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const userId = req.body.userId;
    const username = req.body.username; 
    const newFilename = req.file.filename;

    fs.readdir(uploadDir, (err, files) => {
      if (!err) {
        files.forEach(file => {
          if (file.startsWith(userId + '-') && file !== newFilename) {
            fs.unlink(path.join(uploadDir, file), e => {
              if (e) console.error('❌ Avatar delete error', e);
            });
          }
        });
      }
    });

    const fileUrl = `${baseUrl}/avatars/${newFilename}`;

    if (username) {
      try {
        await pool.query('UPDATE users SET avatar_url = $1 WHERE username = $2', [fileUrl, username]);
        console.log(`🐘 Avatar updated in PostgreSQL for: ${username}`);
      } catch (err) {
        console.error('❌ DB avatar update failed', err);
      }
    }
    res.json({ url: fileUrl });
  });
});

/* ================================
   Chat Image Upload (10MB制限)
================================ */
const chatImageDir = path.join(process.cwd(), 'uploads', 'chat_images');
if (!fs.existsSync(chatImageDir)) fs.mkdirSync(chatImageDir, { recursive: true });

const chatImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatImageDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-img-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 🌟 チャット画像にも画像フィルターを適用！
const uploadChatImage = multer({ 
  storage: chatImageStorage, 
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter 
});

router.post('/upload-chat-image', (req, res) => {
  uploadChatImage.single('image')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File size limit exceeded (10MB max)' });
      return res.status(400).json({ error: err.message }); // フィルターで弾かれた場合
    } else if (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const fileUrl = `${baseUrl}/chat_images/${req.file.filename}`;
    res.json({ url: fileUrl });
  });
});

/* ================================
   Chat File Upload (10MB制限)
================================ */
const chatFileDir = path.join(process.cwd(), 'uploads', 'chat_files');
if (!fs.existsSync(chatFileDir)) fs.mkdirSync(chatFileDir, { recursive: true });

const chatFileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatFileDir),
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-file-' + uniqueSuffix + '-' + originalName);
  }
});

// ※ファイルアップロードは任意の形式を許容するためフィルターなし
const uploadChatFile = multer({ storage: chatFileStorage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload-chat-file', (req, res) => {
  uploadChatFile.single('file')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File size limit exceeded (10MB max)' });
      return res.status(500).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const fileUrl = `${baseUrl}/chat_files/${req.file.filename}`;
    res.json({ url: fileUrl, fileName: Buffer.from(req.file.originalname, 'latin1').toString('utf8') });
  });
});

/* ================================
   🎙️ Chat Audio Upload (10MB制限)
================================ */
const chatAudioDir = path.join(process.cwd(), 'uploads', 'chat_audio');
if (!fs.existsSync(chatAudioDir)) fs.mkdirSync(chatAudioDir, { recursive: true });

const chatAudioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatAudioDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 元の拡張子（.m4aなど）をそのまま保持して保存
    cb(null, 'chat-audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 🌟 音声専用のフィルターを作成！（m4a対策でvideo/mp4も許可）
const audioFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/mp4')) { 
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', '音声以外のファイルはアップロードできません'));
  }
};

// 🌟 チャット音声にフィルターを適用！
const uploadChatAudio = multer({ 
  storage: chatAudioStorage, 
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: audioFilter 
});

router.post('/upload-chat-audio', (req, res) => {
  uploadChatAudio.single('audio')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File size limit exceeded (10MB max)' });
      return res.status(400).json({ error: err.message }); // フィルターで弾かれた場合
    } else if (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // server.js の app.use('/uploads', ...) を利用して公開URLを生成
    const fileUrl = `${baseUrl}/chat_audio/${req.file.filename}`;
    res.json({ url: fileUrl });
  });
});

module.exports = router;