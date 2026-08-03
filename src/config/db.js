/**
 * MySQL connection pool and readiness check.
 * Uses mysql2/promise with utf8mb4 and decimalNumbers for precise numerics.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'student_performance',
  connectionLimit: 10,
  decimalNumbers: true,
  charset: 'utf8mb4',
  waitForConnections: true,
  // Queue limit prevents unbounded memory growth under load
  queueLimit: 1000,
});

/**
 * Verify the pool can serve queries and the target table exists.
 * Sets app.locals.dbReady = true/false for the dashboard to render
 * a helpful error page instead of crashing.
 */
async function ensureReady() {
  try {
    // 1) Basic connectivity
    await pool.query('SELECT 1');
    // 2) Table exists and has data (or at least schema)
    await pool.query(`SELECT COUNT(*) AS cnt FROM \`${process.env.DB_TABLE || 'students'}\``);
    return true;
  } catch (err) {
    // Don't throw — the app should start and show a friendly message
    return false;
  }
}

module.exports = { pool, ensureReady };