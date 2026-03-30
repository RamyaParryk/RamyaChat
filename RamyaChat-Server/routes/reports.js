const express = require('express');
const router = express.Router();
const pool = require('../config/db'); //

router.post('/reports', async (req, res) => {
    const { reporterId, reportedUserId, reason, details } = req.body;

    try {
        const query = `
            INSERT INTO reports (reporter_id, reported_user_id, reason, details)
            VALUES ($1, $2, $3, $4)
            RETURNING id, created_at;
        `;
        const values = [reporterId, reportedUserId, reason, details];

        const result = await pool.query(query, values);

        res.status(201).json({
            success: true,
            reportId: result.rows[0].id,
            createdAt: result.rows[0].created_at
        });
    } catch (error) {
        console.error('通報保存エラー:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;