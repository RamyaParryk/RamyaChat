// DMリスト取得、検索APIなど
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
// 👇 もし環境変数が空っぽでも、右側のURLが必ず使われる
const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://chat.tomato-juice.biz';

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
        ) AS unread
      FROM messages m
      LEFT JOIN users u ON u.username = (
        CASE
          WHEN left(m.room_id, length($1) + 1) = $1 || '_' 
          THEN right(m.room_id, length(m.room_id) - length($1) - 1)
          ELSE left(m.room_id, length(m.room_id) - length($1) - 1)
        END
      )
      WHERE m.room_id LIKE '%' || $1 || '%'
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
   Search Messages API (串刺し検索)
================================ */
router.get('/search-messages', async (req, res) => {
  const { currentUsername, q } = req.query;
  if (!currentUsername || !q) return res.json([]);

  try {
    const result = await pool.query(`
      SELECT 
        m.message_id,
        m.room_id,
        m.text,
        m.timestamp,
        (CASE
          WHEN left(m.room_id, length($1) + 1) = $1 || '_' 
          THEN right(m.room_id, length(m.room_id) - length($1) - 1)
          ELSE left(m.room_id, length(m.room_id) - length($1) - 1)
        END) AS target_username,
        target_u.display_name AS partner_name,
        target_u.avatar_url AS partner_avatar,
        sender_u.display_name AS sender_name
      FROM messages m
      LEFT JOIN users target_u ON target_u.username = (
        CASE
          WHEN left(m.room_id, length($1) + 1) = $1 || '_' 
          THEN right(m.room_id, length(m.room_id) - length($1) - 1)
          ELSE left(m.room_id, length(m.room_id) - length($1) - 1)
        END
      )
      LEFT JOIN users sender_u ON m.sender_id = sender_u.user_id
      WHERE m.room_id LIKE '%' || $1 || '%'
        AND m.text ILIKE $2
      ORDER BY m.timestamp DESC
      LIMIT 50
    `, [currentUsername, `%${q}%`]);
      
    const searchResults = result.rows.map(row => {
      const partnerUsername = row.target_username;
      const displayName = row.partner_name || partnerUsername; 
      const avatar = row.partner_avatar || `${baseUrl}/avatars/default.png`;

      return {
        message_id: row.message_id,
        room_id: row.room_id,
        text: row.text,
        timestamp: row.timestamp,
        sender_name: row.sender_name, 
        user: { username: partnerUsername, display_name: displayName, avatar: avatar }
      };
    });
    res.json(searchResults);
  } catch (err) {
    console.error(`❌ Message search error for ${currentUsername}`, err);
    res.status(500).json({ error: 'DB error' });
  }
});
module.exports = router;