const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// uploads フォルダと avatars フォルダの画像の公開設定
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));
app.use('/chat_files', express.static(path.join(__dirname, 'uploads', 'chat_files')));
app.use('/chat_images', express.static(path.join(__dirname, 'uploads', 'chat_images')));
app.use('/chat_audio', express.static(path.join(__dirname, 'uploads', 'chat_audio')));

// 🌟 切り出した各種ルーター（API）を読み込む！
const uploadRoutes = require('./routes/upload');
const friendsRoutes = require('./routes/friends');
const chatRoutes = require('./routes/chat');
const reportsRouter = require('./routes/reports');

// 🌟 アプリにルーターを適用！
app.use('/', uploadRoutes);
app.use('/', friendsRoutes);
app.use('/', chatRoutes);
app.use('/', reportsRouter);

// 🌟 切り出したSocket通信を起動！
require('./sockets/chatHandler')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ℹ️  Server started on port ${PORT}`);
});

// ログ
app.use((err, req, res, next) => {
  console.error('🔥 SERVER ERROR:', err.message);
  console.error('🔥 Full Stack:', err.stack);
  res.status(500).json({ error: err.message });
});