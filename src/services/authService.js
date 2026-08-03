/**
 * Auth Service — ALL SQL for authentication and user management.
 * No column names from user input appear in SQL strings; only ? bindings.
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const SALT_ROUNDS = 12;

/**
 * Auto-create the users table on app boot.
 * Fixed schema — separate from the schema-agnostic students table.
 */
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      role ENUM('admin', 'user') DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Register a new user.
 * First user gets admin role; subsequent users get 'user'.
 * Returns the created user object (without password_hash).
 */
async function registerUser({ email, password, name }) {
  // Determine role: first user is admin
  const [{ count }] = await pool.query('SELECT COUNT(*) AS count FROM users');
  const role = count === 0 ? 'admin' : 'user';

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
    [email, password_hash, name, role]
  );

  return { id: result.insertId, email, name, role };
}

/**
 * Authenticate a user by email and password.
 * Returns the user object (without password_hash) or null on failure.
 */
async function loginUser({ email, password }) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  if (!rows.length) return null;

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * Find a user by ID — used for session hydration.
 * Never returns the password_hash.
 */
async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
    [id]
  );
  return rows.length ? rows[0] : null;
}

/**
 * Check if an email is already registered.
 */
async function emailExists(email) {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  return rows.length > 0;
}

/**
 * List all users — admin only.
 * Ordered by creation date ascending.
 */
async function listUsers() {
  const [rows] = await pool.query(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at'
  );
  return rows;
}

/**
 * Delete a non-admin user by ID.
 * Prevents accidental deletion of admin accounts.
 * Returns number of affected rows (0 if admin or not found).
 */
async function deleteUser(id) {
  const [result] = await pool.query(
    'DELETE FROM users WHERE id = ? AND role != ?',
    [id, 'admin']
  );
  return result.affectedRows;
}

module.exports = {
  ensureUsersTable,
  registerUser,
  loginUser,
  findById,
  emailExists,
  listUsers,
  deleteUser,
};