const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://chat.tomato-juice.biz';

/* ================================
   🌟 チャット履歴のクリア
================================ */
router.post('/clear-chat', async (req, res) => {
  const { roomId, username } = req.body;
  if (!roomId || !username) return res.status(400).json({ error: 'Missing parameters' });

  try {
    // 🌟 自分の名前_ から始まるかどうかで判定
    if (roomId.startsWith(username + '_')) {
      await pool.query('UPDATE rooms SET user1_cleared_at = NOW() WHERE room_id = $1', [roomId]);
    } else {
      await pool.query('UPDATE rooms SET user2_cleared_at = NOW() WHERE room_id = $1', [roomId]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Clear chat error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ================================
   DM List API
================================ */
router.get('/dm-list/:username', async (req, res) => {
  const username = req.params.username;

  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (m.room_id)
        m.room_id,
        (CASE
          WHEN m.text IS NOT NULL AND m.text <> '' THEN m.text
          WHEN m.image_url IS NOT NULL THEN '__IMAGE__'
          WHEN m.file_url IS NOT NULL THEN '__FILE__'
          ELSE ''
        END) AS last_message,
        m.timestamp AS last_time,
        (CASE
          WHEN left(m.room_id, length($1) + 1) = $1 || '_' 
          THEN right(m.room_id, length(m.room_id) - length($1) - 1)
          ELSE left(m.room_id, length(m.room_id) - length($1) - 1)
        END) AS target_username,
        u.display_name AS partner_name,
        u.avatar_url AS partner_avatar,
        (
          SELECT COUNT(*)
          FROM messages m2
          JOIN users sender ON m2.sender_id = sender.user_id
          WHERE m2.room_id = m.room_id
            AND sender.username != $1
            AND m2.is_read = FALSE
            -- 🌟 未読バッジもクリア時間以降のものだけカウント
            AND m2.timestamp >= COALESCE(
              (SELECT CASE 
                        WHEN left(r.room_id, length($1) + 1) = $1 || '_' THEN r.user1_cleared_at
                        ELSE r.user2_cleared_at
                      END 
               FROM rooms r WHERE r.room_id = m.room_id),
              '1970-01-01'::timestamp
            )
        ) AS unread
      FROM messages m
      LEFT JOIN users u ON u.username = (
        CASE
          WHEN left(m.room_id, length($1) + 1) = $1 || '_' 
          THEN right(m.room_id, length(m.room_id) - length($1) - 1)
          ELSE left(m.room_id, length(m.room_id) - length($1) - 1)
        END
      )
      WHERE 
        -- 🌟 幽霊チャット防止＆複数アンダーバー完全対応の完璧な条件式
        (left(m.room_id, length($1) + 1) = $1 || '_' OR right(m.room_id, length($1) + 1) = '_' || $1)
        AND m.deleted_at IS NULL
        -- 🌟 最新メッセージがクリア時間より新しい部屋だけをリストに出す
        AND m.timestamp >= COALESCE(
          (SELECT CASE 
                    WHEN left(r.room_id, length($1) + 1) = $1 || '_' THEN r.user1_cleared_at
                    ELSE r.user2_cleared_at
                  END 
           FROM rooms r WHERE r.room_id = m.room_id),
          '1970-01-01'::timestamp
        )
      ORDER BY m.room_id, m.timestamp DESC
    `, [username]);
      
    const dmList = result.rows.map(row => {
      const partnerUsername = row.target_username;
      const displayName = row.partner_name || partnerUsername; 
      const avatar = row.partner_avatar || `${baseUrl}/avatars/default.png`;

      return {
        room_id: row.room_id,
        user: { username: partnerUsername, display_name: displayName, avatar: avatar },
        last_message: row.last_message,
        last_time: row.last_time,
        unread: parseInt(row.unread, 10) || 0
      };
    });

    dmList.sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime());
    res.json(dmList);
  } catch (err) {
    console.error(`❌ DM list fetch error for ${username}`, err);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ================================
   Search Messages API
================================ */
router.get('/search-messages', async (req, res) => {
  const { currentUsername, q } = req.query;
  if (!currentUsername || !q) return res.json([]);

  try {
    const result = await pool.query(`
      SELECT 
        m.message_id, m.room_id, m.text, m.timestamp,
        (CASE WHEN left(m.room_id, length($1) + 1) = $1 || '_' THEN right(m.room_id, length(m.room_id) - length($1) - 1) ELSE left(m.room_id, length(m.room_id) - length($1) - 1) END) AS target_username,
        target_u.display_name AS partner_name, target_u.avatar_url AS partner_avatar, sender_u.display_name AS sender_name
      FROM messages m
      LEFT JOIN users target_u ON target_u.username = (CASE WHEN left(m.room_id, length($1) + 1) = $1 || '_' THEN right(m.room_id, length(m.room_id) - length($1) - 1) ELSE left(m.room_id, length(m.room_id) - length($1) - 1) END)
      LEFT JOIN users sender_u ON m.sender_id = sender_u.user_id
      WHERE 
        -- 🌟 幽霊チャット防止＆複数アンダーバー完全対応
        (left(m.room_id, length($1) + 1) = $1 || '_' OR right(m.room_id, length($1) + 1) = '_' || $1)
        AND m.text ILIKE $2
      ORDER BY m.timestamp DESC LIMIT 50
    `, [currentUsername, `%${q}%`]);
      
    const searchResults = result.rows.map(row => {
      const partnerUsername = row.target_username;
      return {
        message_id: row.message_id, room_id: row.room_id, text: row.text, timestamp: row.timestamp, sender_name: row.sender_name, 
        user: { username: partnerUsername, display_name: row.partner_name || partnerUsername, avatar: row.partner_avatar || `${baseUrl}/avatars/default.png` }
      };
    });
    res.json(searchResults);
  } catch (err) {
    console.error(`❌ Message search error for ${currentUsername}`, err);
    res.status(500).json({ error: 'DB error' });
  }
});
module.exports = router;