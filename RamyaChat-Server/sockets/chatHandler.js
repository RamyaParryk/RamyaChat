const pool = require('../config/db');
const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://chat.ratolab.uk';
const translations = require('../utils/translations.json');

function getMsg(lang, key) {
  const l = translations[lang] || translations['ja'];
  return l[key] || translations['en'][key];
}

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

async function saveMessageToDB(msg, roomId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query(`
      INSERT INTO users (username, display_name, avatar_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (username)
      DO UPDATE SET display_name = EXCLUDED.display_name,
        avatar_url = CASE WHEN users.avatar_url LIKE '%chat.ratolab.uk%' THEN users.avatar_url ELSE EXCLUDED.avatar_url END
      RETURNING user_id
    `, [msg.user.username, msg.user.name, msg.user.avatar]);
    
    const userId = userRes.rows[0].user_id;
    await client.query(`INSERT INTO rooms (room_id, room_name) VALUES ($1, $2) ON CONFLICT (room_id) DO NOTHING`, [roomId, `Private Room ${roomId}`]);
    
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

const activeUsers = new Map();
// 🌟 メモリリークを防ぐため、オブジェクト構造にしてタイマーも一緒に管理
const activeRingingCalls = new Map(); 

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected ${socket.id}`);

    // ==========================================
    // チャット・オンライン管理ロジック
    // ==========================================
    socket.on('user_online', async (data) => {
      const username = typeof data === 'string' ? data : (data.username || data._id);
      const displayName = typeof data === 'object' ? (data.name || data.displayName) : username;
      const avatarUrl = typeof data === 'object' ? data.avatar : `${baseUrl}/avatars/default.png`;

      if (!username) return;

      socket.userId = username;
      activeUsers.set(socket.id, username);
      
      try {
        await pool.query(`
          INSERT INTO users (username, display_name, avatar_url, is_active, deleted_at)
          VALUES ($1, $2, $3, true, NULL)
          ON CONFLICT (username) 
          DO UPDATE SET is_active = true, deleted_at = NULL
        `, [username, displayName, avatarUrl]);
      } catch (err) {}

      socket.join(username);
      const onlineIds = [...new Set(activeUsers.values())];
      io.emit('update_online_users', onlineIds);
    });

    socket.on('typing_start', ({ roomId, userId }) => socket.to(roomId).emit('display_typing', { userId, isTyping: true }));
    socket.on('typing_stop', ({ roomId, userId }) => socket.to(roomId).emit('display_typing', { userId, isTyping: false }));

    socket.on('join_room', async ({ roomId, userId, targetMessageId }) => {
      socket.join(roomId);
      try {
        await pool.query(`UPDATE messages SET is_read = TRUE WHERE room_id = $1 AND sender_id != (SELECT user_id FROM users WHERE username = $2) AND is_read = FALSE`, [roomId, userId]);
        
        const partnerId = roomId.startsWith(userId + '_') ? roomId.slice(userId.length + 1) : roomId.slice(0, roomId.length - userId.length - 1);
        if (partnerId) io.to(partnerId).emit('messages_read', { roomId });
        socket.to(roomId).emit('messages_read', { roomId });

        const clearedAtRes = await pool.query(`SELECT CASE WHEN left(room_id, length($1) + 1) = $1 || '_' THEN user1_cleared_at ELSE user2_cleared_at END as cleared_at FROM rooms WHERE room_id = $2`, [userId, roomId]);
        const clearedAt = clearedAtRes.rows[0]?.cleared_at || '1970-01-01T00:00:00.000Z';
        
        let query = '';
        let params = [roomId, clearedAt];

        if (targetMessageId) {
          query = `
            WITH target_msg AS (SELECT timestamp FROM messages WHERE message_id = $3),
            around_messages AS (
              (SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
              FROM messages m JOIN users u ON m.sender_id = u.user_id WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.timestamp >= (SELECT timestamp FROM target_msg) ORDER BY m.timestamp ASC LIMIT 10)
              UNION ALL
              (SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
              FROM messages m JOIN users u ON m.sender_id = u.user_id WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.timestamp < (SELECT timestamp FROM target_msg) ORDER BY m.timestamp DESC LIMIT 40)
            )
            SELECT * FROM around_messages ORDER BY "createdAt" DESC
          `;
          params.push(targetMessageId); 
        } else {
          query = `
            SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
            FROM messages m JOIN users u ON m.sender_id = u.user_id 
            WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.timestamp >= $2 
            ORDER BY m.timestamp DESC LIMIT 50
          `;
        }

        const res = await pool.query(query, params);
        const history = res.rows.map(row => ({
          _id: row._id.toString(), text: row.text, image: row.image, file: row.file, fileName: row.fileName, audio: row.audio, createdAt: row.createdAt, isRead: row.isRead,
          user: { _id: row.userUsername, name: row.userName, username: row.userUsername, avatar: row.userAvatar }
        }));
        socket.emit('load_history', history);
      } catch (err) { console.error('❌ History load error', err); }
    });

    socket.on('load_more_history', async ({ roomId, cursor }) => {
      try {
        const userId = socket.userId;
        const clearedAtRes = await pool.query(`SELECT CASE WHEN left(room_id, length($1) + 1) = $1 || '_' THEN user1_cleared_at ELSE user2_cleared_at END as cleared_at FROM rooms WHERE room_id = $2`, [userId, roomId]);
        const clearedAt = clearedAtRes.rows[0]?.cleared_at || '1970-01-01T00:00:00.000Z';

        const query = `
          SELECT m.message_id AS "_id", m.text, m.image_url AS "image", m.file_url AS "file", m.file_name AS "fileName", m.audio AS "audio", m.timestamp AS "createdAt", m.is_read AS "isRead", u.username AS "userUsername", u.display_name AS "userName", u.avatar_url AS "userAvatar"
          FROM messages m JOIN users u ON m.sender_id = u.user_id 
          WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.timestamp < $2 AND m.timestamp >= $3
          ORDER BY m.timestamp DESC LIMIT 50
        `;
        const res = await pool.query(query, [roomId, cursor, clearedAt]);
        const history = res.rows.map(row => ({
          _id: row._id.toString(), text: row.text, image: row.image, file: row.file, fileName: row.fileName, audio: row.audio, createdAt: row.createdAt, isRead: row.isRead,
          user: { _id: row.userUsername, name: row.userName, username: row.userUsername, avatar: row.userAvatar }
        }));

        if (history.length === 0) return;
        socket.emit('receive_more_history', history);
      } catch (err) {}
    });

    socket.on('send_message', async (data) => {
      try {
        const senderUsername = data.user._id;
        const receiverUsername = data.receiverId; 

        if (receiverUsername) {
          const relationCheck = await pool.query(`
            SELECT status FROM friendships
            WHERE (user_id = (SELECT user_id FROM users WHERE username = $1 AND is_active = true) AND friend_id = (SELECT user_id FROM users WHERE username = $2 AND is_active = true))
               OR (user_id = (SELECT user_id FROM users WHERE username = $2 AND is_active = true) AND friend_id = (SELECT user_id FROM users WHERE username = $1 AND is_active = true))
          `, [receiverUsername, senderUsername]);

          let isBlocked = false;
          let isFriend = false;
          relationCheck.rows.forEach(row => {
            if (row.status === 'blocked') isBlocked = true;
            if (row.status === 'accepted') isFriend = true;
          });

          if (isBlocked || !isFriend) {
            data.createdAt = new Date().toISOString();
            socket.emit('receive_message', data);
            return; 
          }
        }
      } catch (err) { 
        // 🌟 今後バグが見つけやすいようにエラーログを出力
        console.error('❌ send_message relation check error:', err);
        return; 
      }

      data.createdAt = new Date().toISOString();
      data.isRead = false; 
      const roomId = data.roomId;
      await saveMessageToDB(data, roomId);
      
      io.to(roomId).emit('receive_message', data);
      io.to(data.user._id).emit('dm_list_update');
      if (data.receiverId) io.to(data.receiverId).emit('dm_list_update');

      try {
        const receiverUsername = data.receiverId;
        const senderUsernameForPush = data.user.username || data.user._id; 

        if (receiverUsername) {
          const receiverRes = await pool.query('SELECT push_token, language FROM users WHERE username = $1 AND is_active = true', [receiverUsername]);
          if (receiverRes.rows.length > 0) {
            const pushToken = receiverRes.rows[0].push_token;
            const langCode = receiverRes.rows[0].language;
            
            if (pushToken && pushToken.startsWith('ExponentPushToken')) {
              const senderRes = await pool.query('SELECT display_name, avatar_url FROM users WHERE username = $1', [senderUsernameForPush]);
              const senderDisplayName = senderRes.rows[0]?.display_name || data.user.name || senderUsernameForPush;
              const senderAvatar = senderRes.rows[0]?.avatar_url || data.user.avatar || `${baseUrl}/avatars/default.png`;
              
              const lang = langCode || 'ja'; 
              let msgBody = data.text;
              if (data.image) msgBody = getMsg(lang, 'imageSentMessage');
              if (data.file) msgBody = getMsg(lang, 'fileSentMessage');
              if (data.audio) msgBody = getMsg(lang, 'audioSentMessage');

              const pushData = { roomId: roomId, sender: { username: senderUsernameForPush, displayName: senderDisplayName, avatar: senderAvatar } };
              const pushTitle = `${senderDisplayName}${getMsg(lang, 'newMsg')}`;
              await sendPushNotification(pushToken, pushTitle, msgBody, pushData);
            }
          }
        }
      } catch (err) {
        console.error('❌ push notification processing error:', err);
      }
    });

    socket.on('mark_as_read', async ({ roomId, userId }) => {
      try {
        await pool.query(`UPDATE messages SET is_read = TRUE WHERE room_id = $1 AND sender_id != (SELECT user_id FROM users WHERE username = $2) AND is_read = FALSE`, [roomId, userId]);
        const partnerId = roomId.startsWith(userId + '_') ? roomId.slice(userId.length + 1) : roomId.slice(0, roomId.length - userId.length - 1);
        if (partnerId) io.to(partnerId).emit('messages_read', { roomId });
        socket.to(roomId).emit('messages_read', { roomId });
      } catch (err) {}
    });

    // ==========================================
    // 📞 WebRTC 通話機能の中継用イベント
    // ==========================================
    socket.on('initiate_call', async (data) => {
      console.log(`📞 Call initiated in room ${data.roomId}`);
      
      const callerUsername = socket.userId;
      if (!callerUsername) return;
      
      const receiverUsername = data.roomId.startsWith(callerUsername + '_') 
        ? data.roomId.slice(callerUsername.length + 1) 
        : data.roomId.slice(0, data.roomId.length - callerUsername.length - 1);

      if (!receiverUsername) return;

      try {
        // 🛡️ 1. 相互のブロック・友達関係を厳格チェック
        const relationCheck = await pool.query(`
          SELECT f.status FROM friendships f
          WHERE (f.user_id = (SELECT user_id FROM users WHERE username = $1 AND is_active = true) AND f.friend_id = (SELECT user_id FROM users WHERE username = $2 AND is_active = true))
             OR (f.user_id = (SELECT user_id FROM users WHERE username = $2 AND is_active = true) AND f.friend_id = (SELECT user_id FROM users WHERE username = $1 AND is_active = true))
        `, [receiverUsername, callerUsername]);

        let isBlocked = false;
        let isFriend = false;
        relationCheck.rows.forEach(row => {
          if (row.status === 'blocked') isBlocked = true;
          if (row.status === 'accepted') isFriend = true;
        });

        // ブロックされている、または友達でないなら強制終了
        if (isBlocked || !isFriend) {
          console.log(`🛡️ Call blocked from ${callerUsername} to ${receiverUsername}`);
          socket.emit('call_rejected');
          return;
        }

        // 🌟 2. メモリリーク対策付きでコール情報を登録
        if (activeRingingCalls.has(data.roomId)) {
          clearTimeout(activeRingingCalls.get(data.roomId).timeoutId);
        }

        const timeoutId = setTimeout(() => {
          if (activeRingingCalls.has(data.roomId)) {
            console.log(`⏰ Call timeout for room ${data.roomId} (Auto cleaned)`);
            activeRingingCalls.delete(data.roomId);
          }
        }, 60000);

        activeRingingCalls.set(data.roomId, {
          startTime: Date.now(),
          timeoutId: timeoutId
        });

        // 相手にシグナリングパケットを送信
        socket.to(data.roomId).emit('incoming_call', {
          callerName: data.callerName,
          isVideo: data.isVideo,
          fromSocketId: socket.id
        });

        // 3. プッシュ通知を送信
        const receiverRes = await pool.query('SELECT push_token, language FROM users WHERE username = $1 AND is_active = true', [receiverUsername]);
        if (receiverRes.rows.length > 0) {
          const pushToken = receiverRes.rows[0].push_token;
          const langCode = receiverRes.rows[0].language;
          
          if (pushToken && pushToken.startsWith('ExponentPushToken')) {
            const senderRes = await pool.query('SELECT display_name, avatar_url FROM users WHERE username = $1', [callerUsername]);
            const senderDisplayName = senderRes.rows[0]?.display_name || data.callerName;
            const senderAvatar = senderRes.rows[0]?.avatar_url || `${baseUrl}/avatars/default.png`;
            
            const lang = langCode || 'ja'; 
            
            const pushTitle = `${senderDisplayName} ${getMsg(lang, 'callPushTitle') || 'からの着信'}`;
            const pushBody = data.isVideo 
              ? (getMsg(lang, 'videoCallPushBody') || '📹 ビデオ通話の着信です') 
              : (getMsg(lang, 'audioCallPushBody') || '📞 音声通話の着信です');

            const pushData = { 
              roomId: data.roomId, 
              sender: { username: callerUsername, displayName: senderDisplayName, avatar: senderAvatar },
              isCall: true,
              isVideo: data.isVideo
            };
            
            await sendPushNotification(pushToken, pushTitle, pushBody, pushData);
          }
        }
      } catch (err) {
        console.error('❌ Call initiation / safety check error:', err);
        socket.emit('call_rejected');
      }
    });

    socket.on('accept_call', (data) => {
      const callInfo = activeRingingCalls.get(data.roomId);
      if (callInfo) {
        clearTimeout(callInfo.timeoutId);
        activeRingingCalls.delete(data.roomId);
      }
      socket.to(data.roomId).emit('call_accepted', { fromSocketId: socket.id });
    });

    socket.on('reject_call', (data) => {
      const callInfo = activeRingingCalls.get(data.roomId);
      if (callInfo) {
        clearTimeout(callInfo.timeoutId);
        activeRingingCalls.delete(data.roomId);
      }
      socket.to(data.roomId).emit('call_rejected');
    });

    socket.on('check_call_status', ({ roomId }) => {
      const callInfo = activeRingingCalls.get(roomId);
      const isActive = callInfo && (Date.now() - callInfo.startTime < 60000);
      socket.emit('call_status_result', { isActive: !!isActive });
    });

    socket.on('webrtc_offer', (data) => {
      socket.to(data.roomId).emit('webrtc_offer', { offer: data.offer });
    });

    socket.on('webrtc_answer', (data) => {
      socket.to(data.roomId).emit('webrtc_answer', { answer: data.answer });
    });

    socket.on('webrtc_ice_candidate', (data) => {
      socket.to(data.roomId).emit('webrtc_ice_candidate', { candidate: data.candidate });
    });

    // ==========================================
    // 📞 通話履歴の保存
    // ==========================================
    socket.on('save_call_history', async (data) => {
      try {
        const { roomId, callerId, receiverId, callType, status, duration } = data;
        await pool.query(`
          INSERT INTO calls (room_id, caller_id, receiver_id, call_type, status, duration) 
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [roomId, callerId, receiverId, callType, status, duration || 0]);
        
        io.to(receiverId).emit('call_history_updated');
        io.to(callerId).emit('call_history_updated');
        console.log(`🐘 Call history saved: room:${roomId}, status:${status}`);
      } catch (err) {
        console.error('❌ Failed to save call history into database:', err);
      }
    });

    // ==========================================
    // 切断ロジック
    // ==========================================
    socket.on('disconnect', () => {
      activeUsers.delete(socket.id);
      const onlineIds = [...new Set(activeUsers.values())];
      io.emit('update_online_users', onlineIds);
    });
  });
};