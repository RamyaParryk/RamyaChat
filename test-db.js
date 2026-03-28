require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL接続成功！');
    console.log('サーバー時刻:', res.rows[0].now);
    await pool.end();
  } catch (err) {
    console.error('❌ 接続エラー:', err.stack);
  }
}

testConnection();