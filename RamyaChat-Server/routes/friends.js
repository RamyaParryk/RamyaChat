// routes/friends.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. 🔍 ユーザー検索 (幽霊退治版)
router.get('/search-users', async (req, res) => {
  const { q, currentUsername } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url
      FROM users u
      WHERE (u.username ILIKE $1 OR COALESCE(u.display_name, '') ILIKE $1) 
      AND u.username != $2
      AND u.is_active = true       -- 🌟 生きている人限定
      AND u.deleted_at IS NULL     -- 🌟 削除されていない人限定
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE (f.user_id = u.user_id AND f.friend_id = (SELECT user_id FROM users WHERE username = $2 AND is_active = true))
           OR (f.friend_id = u.user_id AND f.user_id = (SELECT user_id FROM users WHERE username = $2 AND is_active = true))
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
        (SELECT user_id FROM users WHERE username = $1 AND is_active = true),
        (SELECT user_id FROM users WHERE username = $2 AND is_active = true),
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

// 4. 友達リスト取得
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
      WHERE f.status = 'accepted' AND u.is_active = true
    `, [username]);

    const pendingResult = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url
      FROM friendships f
      JOIN users u ON f.user_id = u.user_id
      WHERE f.friend_id = (SELECT user_id FROM users WHERE username = $1)
        AND f.status = 'pending' AND u.is_active = true
    `, [username]);

    const blockedResult = await pool.query(`
      SELECT u.username, u.display_name, u.avatar_url
      FROM friendships f
      JOIN users u ON f.friend_id = u.user_id
      WHERE f.user_id = (SELECT user_id FROM users WHERE username = $1)
        AND f.status = 'blocked'
    `, [username]);

    res.json({ friends: friendsResult.rows, pendingRequests: pendingResult.rows, blockedUsers: blockedResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// 5. お気に入りの ON/OFF
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

// 6. 友達管理
router.post('/friend-manage', async (req, res) => {
  const { currentUsername, targetUsername, action } = req.body;
  try {
    if (action === 'deleted') {
      await pool.query(`DELETE FROM friendships WHERE (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2)) OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))`, [currentUsername, targetUsername]);
    } else if (action === 'blocked') {
      await pool.query(`DELETE FROM friendships WHERE (user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2)) OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1))`, [currentUsername, targetUsername]);
      await pool.query(`INSERT INTO friendships (user_id, friend_id, status) VALUES ((SELECT user_id FROM users WHERE username = $1), (SELECT user_id FROM users WHERE username = $2), 'blocked')`, [currentUsername, targetUsername]);
    } else if (action === 'unblocked') {
      await pool.query(`UPDATE friendships SET status = 'accepted' WHERE user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2)`, [currentUsername, targetUsername]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Manage friend error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// 7. ブロック状態確認
router.get('/check-block', async (req, res) => {
  const { me, partner } = req.query;
  try {
    const meResult = await pool.query(`SELECT 1 FROM friendships WHERE user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2) AND status = 'blocked'`, [me, partner]);
    const partnerResult = await pool.query(`SELECT 1 FROM friendships WHERE user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1) AND status = 'blocked'`, [me, partner]);
    const friendResult = await pool.query(`SELECT 1 FROM friendships WHERE status = 'accepted' AND ((user_id = (SELECT user_id FROM users WHERE username = $1) AND friend_id = (SELECT user_id FROM users WHERE username = $2)) OR (user_id = (SELECT user_id FROM users WHERE username = $2) AND friend_id = (SELECT user_id FROM users WHERE username = $1)))`, [me, partner]);
    res.json({ blockedByMe: meResult.rowCount > 0, blockedByPartner: partnerResult.rowCount > 0, isFriend: friendResult.rowCount > 0 });
  } catch (err) {
    res.json({ blockedByMe: false, blockedByPartner: false, isFriend: false });
  }
});

// 8. プッシュトークン
router.post('/update-push-token', async (req, res) => {
  const { username, token } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });
  try {
    await pool.query('UPDATE users SET push_token = $1 WHERE username = $2', [token, username]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'DB error' }); }
});

// ================================
// 9. 🛡️ 論理削除 & ID解放 API (完全版)
// ================================
router.post('/delete-account', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    // 🌟 同じIDで再登録できるように、名前を書き換えて枠を空ける
    const anonymizedUsername = `deleted_${username}_${Date.now()}`;

    // 1. ユーザーを論理削除＆リネーム
    await pool.query(
      'UPDATE users SET username = $1, is_active = false, deleted_at = NOW() WHERE username = $2',
      [anonymizedUsername, username]
    );

    // 2. そのユーザーが関わるルームも論理削除
    await pool.query(
      "UPDATE rooms SET deleted_at = NOW() WHERE room_id LIKE $1 OR room_id LIKE $2",
      [`%_${username}`, `${username}_%`]
    );

    // 3. メッセージも論理削除 (証拠は残しつつアプリからは消す)
    await pool.query(
      'UPDATE messages SET deleted_at = NOW() WHERE sender_id = (SELECT user_id FROM users WHERE username = $1)',
      [anonymizedUsername] 
    );

    console.log(`🔒 User ${username} deleted and anonymized to ${anonymizedUsername}.`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Soft Delete error:', err);
    res.status(500).json({ error: 'Database update failed' });
  }
});

module.exports = router;