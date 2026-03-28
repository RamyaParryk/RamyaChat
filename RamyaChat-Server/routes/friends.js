// 友達追加・検索・ブロックなど
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. 🔍 ユーザー検索
router.get('/search-users', async (req, res) => {
  const { q, currentUsername } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url
      FROM users u
      WHERE u.username ILIKE $1 AND u.username != $2
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE (f.user_id = u.user_id AND f.friend_id = (SELECT user_id FROM users WHERE username = $2))
           OR (f.friend_id = u.user_id AND f.user_id = (SELECT user_id FROM users WHERE username = $2))
      )
      LIMIT 20
    `, [`%${q}%`, currentUsername]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Search users error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 2. 💌 友達リクエスト送信
router.post('/friend-request', async (req, res) => {
  const { fromUsername, toUsername } = req.body;
  try {
    await pool.query(`
      INSERT INTO friendships (user_id, friend_id, status)
      VALUES (
        (SELECT user_id FROM users WHERE username = $1),
        (SELECT user_id FROM users WHERE username = $2),
        'pending'
      ) ON CONFLICT DO NOTHING
    `, [fromUsername, toUsername]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Friend request error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 3. ✅🚫 友達リクエストの承認・ブロック・削除
router.post('/friend-respond', async (req, res) => {
  const { fromUsername, toUsername, action } = req.body;
  try {
    if (action === 'rejected') {
      await pool.query(`
        DELETE FROM friendships
        WHERE (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2))
           OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))
      `, [fromUsername, toUsername]);
    } else {
      await pool.query(`
        UPDATE friendships
        SET status = $3
        WHERE user_id = (SELECT user_id FROM users WHERE username = $1)
          AND friend_id = (SELECT user_id FROM users WHERE username = $2)
      `, [fromUsername, toUsername, action]);

      await pool.query(`
        DELETE FROM friendships
        WHERE user_id = (SELECT user_id FROM users WHERE username = $2)
          AND friend_id = (SELECT user_id FROM users WHERE username = $1)
      `, [fromUsername, toUsername]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Friend respond error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 4. 友達リスト取得（お気に入り状態 "is_favorite" も一緒に返す！）
router.get('/friends/:username', async (req, res) => {
  const username = req.params.username;
  try {
    const friendsResult = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url, f.status,
             CASE WHEN fav.friend_id IS NOT NULL THEN true ELSE false END as is_favorite
      FROM friendships f
      JOIN users u ON (f.friend_id = u.user_id AND f.user_id = (SELECT user_id FROM users WHERE username = $1))
                   OR (f.user_id = u.user_id AND f.friend_id = (SELECT user_id FROM users WHERE username = $1))
      LEFT JOIN favorites fav ON fav.user_id = (SELECT user_id FROM users WHERE username = $1) AND fav.friend_id = u.user_id
      WHERE f.status = 'accepted'
    `, [username]);

    const pendingResult = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url
      FROM friendships f
      JOIN users u ON f.user_id = u.user_id
      WHERE f.friend_id = (SELECT user_id FROM users WHERE username = $1)
        AND f.status = 'pending'
    `, [username]);

    const blockedResult = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url
      FROM friendships f
      JOIN users u ON f.friend_id = u.user_id
      WHERE f.user_id = (SELECT user_id FROM users WHERE username = $1)
        AND f.status = 'blocked'
    `, [username]);

    res.json({ 
      friends: friendsResult.rows, 
      pendingRequests: pendingResult.rows,
      blockedUsers: blockedResult.rows 
    });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// 5. お気に入りの ON/OFF を切り替えるAPI
router.post('/toggle-favorite', async (req, res) => {
  const { username, targetUsername, isFavorite } = req.body;
  try {
    if (isFavorite) {
      await pool.query(`
        INSERT INTO favorites (user_id, friend_id)
        VALUES (
          (SELECT user_id FROM users WHERE username = $1),
          (SELECT user_id FROM users WHERE username = $2)
        ) ON CONFLICT DO NOTHING
      `, [username, targetUsername]);
    } else {
      await pool.query(`
        DELETE FROM favorites
        WHERE user_id = (SELECT user_id FROM users WHERE username = $1)
          AND friend_id = (SELECT user_id FROM users WHERE username = $2)
      `, [username, targetUsername]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// 6. 友達の削除・ブロック・ブロック解除を管理する最強API
router.post('/friend-manage', async (req, res) => {
  const { currentUsername, targetUsername, action } = req.body;
  try {
    if (action === 'deleted') {
      await pool.query(`
        DELETE FROM friendships
        WHERE (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2))
           OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))
      `, [currentUsername, targetUsername]);

    } else if (action === 'blocked') {
      await pool.query(`
        DELETE FROM friendships
        WHERE (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2))
           OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))
      `, [currentUsername, targetUsername]);

      await pool.query(`
        INSERT INTO friendships (user_id, friend_id, status)
        VALUES (
          (SELECT user_id FROM users WHERE username = $1),
          (SELECT user_id FROM users WHERE username = $2),
          'blocked'
        )
      `, [currentUsername, targetUsername]);

    } else if (action === 'unblocked') {
      await pool.query(`
        UPDATE friendships 
        SET status = 'accepted'
        WHERE user_id = (SELECT user_id FROM users WHERE username = $1) 
          AND friend_id = (SELECT user_id FROM users WHERE username = $2)
      `, [currentUsername, targetUsername]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Manage friend error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 7. ブロック状態と「本当に友達か？」を同時に確認するAPI
router.get('/check-block', async (req, res) => {
  const { me, partner } = req.query;
  try {
    const meResult = await pool.query(`
      SELECT 1 FROM friendships WHERE user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2) AND status = 'blocked'
    `, [me, partner]);

    const partnerResult = await pool.query(`
      SELECT 1 FROM friendships WHERE user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1) AND status = 'blocked'
    `, [me, partner]);

    const friendResult = await pool.query(`
      SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND (
          (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2))
          OR 
          (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))
        )
    `, [me, partner]);

    res.json({
      blockedByMe: meResult.rowCount > 0,
      blockedByPartner: partnerResult.rowCount > 0,
      isFriend: friendResult.rowCount > 0
    });
  } catch (err) {
    res.json({ blockedByMe: false, blockedByPartner: false, isFriend: false });
  }
});

// 8. プッシュトークン保存API
router.post('/update-push-token', async (req, res) => {
  const { username, token } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  try {
    await pool.query(
      'UPDATE users SET push_token = $1 WHERE username = $2',
      [token, username]
    );
    console.log(`📱 Push token updated for user: ${username}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Push token update error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;