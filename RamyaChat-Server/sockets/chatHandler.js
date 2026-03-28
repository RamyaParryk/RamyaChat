// join_room, send_message など
const pool = require('../config/db');
// 👇 もし環境変数が空っぽでも、右側のURLが必ず使われる
const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://chat.tomato-juice.biz';
const translations = require('../utils/translations.json');

function getMsg(lang, key) {
  const l = translations[lang] || translations['ja'];
  return l[key] || translations['en'][key];
}

/* ================================
   Expo Push Notification Sender
================================ */
async function sendPushNotification(expoPushToken, title, body, pushData = {}) {
  try {
    const message = { to: expoPushToken, sound: 'default', title: title, body: body, data: pushData };
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const receipt = await response.json();
    console.log(`📱 Push receipt: ${JSON.stringify(receipt)}`);
  } catch (err) {
    console.error('❌ Push notification failed', err);
  }
}

/* ================================
   DB save message
================================ */
async function saveMessageToDB(msg, roomId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query(`
      INSERT INTO users (username, display_name, avatar_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (username)
      DO UPDATE SET display_name = EXCLUDED.display_name,
        avatar_url = CASE WHEN users.avatar_url LIKE '%chat.tomato-juice.biz%' THEN users.avatar_url ELSE EXCLUDED.avatar_url END
      RETURNING user_id
    `, [msg.user.username, msg.user.name, msg.user.avatar]);
    
    const userId = userRes.rows[0].user_id;
    await client.query(`INSERT INTO rooms (room_id, room_name) VALUES ($1, $2) ON CONFLICT (room_id) DO NOTHING`, [roomId, `Private Room ${roomId}`]);
    
    // 🌟 INSERT文に audio を追加！
    await client.query(`
      INSERT INTO messages (room_id, sender_id, text, image_url, file_url, file_name, audio, timestamp, is_read)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
    `, [roomId, userId, msg.text || '', msg.image || null, msg.file || null, msg.fileName || null, msg.audio || null, msg.createdAt]);
    
    await client.query('COMMIT');
    console.log(`🐘 Message saved room:${roomId}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ DB save failed', e);
  } finally {
    client.release();
  }
}

let onlineUsers = new Set();

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected ${socket.id}`);
    
    socket.on('user_online', (userId) => {
      socket.userId = userId;
      onlineUsers.add(userId);
      socket.join(userId);
      io.emit('update_online_users', Array.from(onlineUsers));
    });

    socket.on('typing_start', ({ roomId, userId }) => socket.to(roomId).emit('display_typing', { userId, isTyping: true }));
    socket.on('typing_stop', ({ roomId, userId }) => socket.to(roomId).emit('display_typing', { userId, isTyping: false }));

    socket.on('join_room', async ({ roomId, userId, targetMessageId }) => {
      socket.join(roomId);
      try {
        await pool.query(`
          UPDATE messages SET is_read = TRUE
          WHERE room_id = $1 AND sender_id != (SELECT user_id FROM users WHERE username = $2) AND is_read = FALSE
        `, [roomId, userId]);
        socket.to(roomId).emit('messages_read');
        
        let query = '';
        let params = [roomId];

        // 🌟 SELECT文すべてに m.audio を追加！
        if (targetMessageId) {
          query = `
            WITH target_msg AS (SELECT timestamp FROM messages WHERE message_id = $2),
            around_messages AS (
              (SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
              FROM messages m JOIN users u ON m.sender_id = u.user_id WHERE m.room_id = $1 AND m.timestamp >= (SELECT timestamp FROM target_msg) ORDER BY m.timestamp ASC LIMIT 10)
              UNION ALL
              (SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
              FROM messages m JOIN users u ON m.sender_id = u.user_id WHERE m.room_id = $1 AND m.timestamp < (SELECT timestamp FROM target_msg) ORDER BY m.timestamp DESC LIMIT 40)
            )
            SELECT * FROM around_messages ORDER BY "createdAt" DESC
          `;
          params.push(targetMessageId);
        } else {
          query = `
            SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
            FROM messages m JOIN users u ON m.sender_id = u.user_id WHERE m.room_id = $1 ORDER BY m.timestamp DESC LIMIT 50
          `;
        }

        const res = await pool.query(query, params);
        // 🌟 JSONの変換に audio: row.audio を追加！
        const history = res.rows.map(row => ({
          _id: row._id.toString(), text: row.text, image: row.image, file: row.file, fileName: row.fileName, audio: row.audio, createdAt: row.createdAt, isRead: row.isRead,
          user: { _id: row.userUsername, name: row.userName, username: row.userUsername, avatar: row.userAvatar }
        }));
        socket.emit('load_history', history);
      } catch (err) {
        console.error('❌ History load error', err);
      }
    });

    socket.on('load_more_history', async ({ roomId, cursor }) => {
      try {
        // 🌟 SELECT文に m.audio を追加！
        const query = `
          SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
          FROM messages m JOIN users u ON m.sender_id = u.user_id WHERE m.room_id = $1 AND m.timestamp < $2 ORDER BY m.timestamp DESC LIMIT 50
        `;
        const res = await pool.query(query, [roomId, cursor]);
        const history = res.rows.map(row => ({
          _id: row._id.toString(), text: row.text, image: row.image, file: row.file, fileName: row.fileName, audio: row.audio, createdAt: row.createdAt, isRead: row.isRead,
          user: { _id: row.userUsername, name: row.userName, username: row.userUsername, avatar: row.userAvatar }
        }));

        if (history.length === 0) return;
        
        socket.emit('receive_more_history', history);
      } catch (err) {
        console.error('❌ More history load error', err);
      }
    });

    socket.on('send_message', async (data) => {
      try {
        const senderUsername = data.user._id;
        const receiverUsername = data.receiverId; 

        if (receiverUsername) {
          const relationCheck = await pool.query(`
            SELECT status FROM friendships
            WHERE (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2))
               OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))
          `, [receiverUsername, senderUsername]);

          let isBlocked = false;
          let isFriend = false;
          relationCheck.rows.forEach(row => {
            if (row.status === 'blocked') isBlocked = true;
            if (row.status === 'accepted') isFriend = true;
          });

          if (isBlocked || !isFriend) {
            console.log(`💬 [GUARD] 🚫 ${senderUsername} から ${receiverUsername} への通信をブラックホールに吸い込みました`);
            data.createdAt = new Date().toISOString();
            socket.emit('receive_message', data);
            return; 
          }
        }
      } catch (err) {
        console.error("❌ 通信ガード検知エラー:", err);
        return; 
      }

      data.createdAt = new Date().toISOString();
      const roomId = data.roomId;
      await saveMessageToDB(data, roomId);
      
      io.to(roomId).emit('receive_message', data);
      io.to(data.user._id).emit('dm_list_update');
      if (data.receiverId) io.to(data.receiverId).emit('dm_list_update');

      try {
        const receiverUsername = data.receiverId;
        const senderUsernameForPush = data.user.username || data.user._id; 

        if (receiverUsername) {
          const receiverRes = await pool.query('SELECT push_token FROM users WHERE username = $1', [receiverUsername]);
          if (receiverRes.rows.length > 0) {
            const pushToken = receiverRes.rows[0].push_token;
            if (pushToken && pushToken.startsWith('ExponentPushToken')) {
              const senderRes = await pool.query('SELECT display_name, avatar_url FROM users WHERE username = $1', [senderUsernameForPush]);
              const senderDisplayName = senderRes.rows[0]?.display_name || data.user.name || senderUsernameForPush;
              const senderAvatar = senderRes.rows[0]?.avatar_url || data.user.avatar || `${baseUrl}/avatars/default.png`;
              
              const lang = data.lang || 'ja'; 
              let msgBody = data.text;
              if (data.image) msgBody = getMsg(lang, 'imageSentMessage');
              if (data.file) msgBody = getMsg(lang, 'fileSentMessage');
              // 🌟 プッシュ通知にも音声用のテキストを追加！
              if (data.audio) msgBody = '🎤 音声を送信しました';

              const pushData = { roomId: roomId, sender: { username: senderUsernameForPush, displayName: senderDisplayName, avatar: senderAvatar } };
              const pushTitle = `${senderDisplayName}${getMsg(lang, 'newMsg')}`;
              await sendPushNotification(pushToken, pushTitle, msgBody, pushData);
            }
          }
        }
      } catch (err) {
        console.error('❌ Push token fetch error', err);
      }
    });

    socket.on('mark_as_read', async ({ roomId, userId }) => {
      try {
        await pool.query(`UPDATE messages SET is_read = TRUE WHERE room_id = $1 AND sender_id != (SELECT user_id FROM users WHERE username = $2) AND is_read = FALSE`, [roomId, userId]);
        socket.to(roomId).emit('messages_read');
      } catch (err) { console.error('❌ Read update error', err); }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('update_online_users', Array.from(onlineUsers));
      }
    });
  });
};