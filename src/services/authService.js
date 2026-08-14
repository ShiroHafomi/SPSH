/**
 * Auth Service — ALL SQL for authentication and user management.
 * No column names from user input appear in SQL strings; only ? bindings.
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { revokeAllUserSessions } = require('./authSessionService');
const { sanitizeAuditMetadata } = require('../utils/auditSanitizer');

const SALT_ROUNDS = 12;
const VALID_ROLES = ['admin', 'teacher', 'student'];

// Role hierarchy for admin checks (teacher > student, admin > all)
const ROLE_HIERARCHY = {
  admin: 3,
  teacher: 2,
  student: 1,
};

/**
 * Auto-create the users table on app boot.
 * Extended schema with 3 roles, student linkage, and audit fields.
 */
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      role ENUM('admin', 'teacher', 'student') DEFAULT 'student',
      student_id INT UNSIGNED NULL,
      department VARCHAR(100) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_role (role),
      INDEX idx_student_id (student_id),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Auto-create the audit_logs table on app boot.
 * Tracks all admin/teacher mutating operations.
 */
async function ensureAuditLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NULL,
      action VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id INT UNSIGNED NULL,
      metadata JSON NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_action (action),
      INDEX idx_resource (resource_type, resource_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Register a new user.
 * First user gets admin role; subsequent users get 'student' (default).
 * Returns the created user object (without password_hash).
 */
async function registerUser({ email, password, name }) {
  // Determine role: first user is admin, rest default to student
  const [{ count }] = await pool.query('SELECT COUNT(*) AS count FROM users');
  const role = count === 0 ? 'admin' : 'student';

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

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    student_id: user.student_id,
    department: user.department,
    is_active: user.is_active,
  };
}

/**
 * Find a user by ID — used for session hydration.
 * Never returns the password_hash.
 */
async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, email, name, role, student_id, department, is_active, created_at FROM users WHERE id = ?',
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

/**
 * Create a user with specific role (admin only).
 * Returns the created user object (without password_hash).
 */
async function createUser({ email, password, name, role = 'student', studentId = null, department = null }) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
  }

  // If role is student, student_id can be linked; if teacher, department is optional
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash, name, role, student_id, department) VALUES (?, ?, ?, ?, ?, ?)',
    [email, password_hash, name, role, studentId, department]
  );

  return { id: result.insertId, email, name, role, studentId, department };
}

/**
 * Update user details (admin only).
 * Allows updating name, role, password, department, is_active.
 */
async function updateUser(id, { name, role, password, department, isActive }) {
  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    fields.push('role = ?');
    values.push(role);
  }
  if (password !== undefined) {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    fields.push('password_hash = ?');
    values.push(password_hash);
  }
  if (department !== undefined) {
    fields.push('department = ?');
    values.push(department);
  }
  if (isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(isActive ? 1 : 0);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(id);

  const [result] = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  const updated = result.affectedRows > 0;
  if (updated && (password !== undefined || role !== undefined || isActive !== undefined)) {
    await revokeAllUserSessions(id);
  }
  return updated;
}

/**
 * Get user by ID with all fields except password_hash.
 */
async function getUserById(id) {
  const [rows] = await pool.query(
    'SELECT id, email, name, role, student_id, department, is_active, last_login_at, created_at, updated_at FROM users WHERE id = ?',
    [id]
  );
  return rows.length ? rows[0] : null;
}

/**
 * Get user by email with all fields (for authentication).
 */
async function getUserByEmail(email) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  return rows.length ? rows[0] : null;
}

/**
 * Check if a user has admin privileges.
 * @param {Object} user - User object with role property
 * @returns {boolean} True if user is admin
 */
function isAdmin(user) {
  return user && user.role === 'admin';
}

/**
 * Check if a user has teacher or admin privileges.
 * @param {Object} user - User object with role property
 * @returns {boolean} True if user is teacher or admin
 */
function isTeacherOrAdmin(user) {
  return user && (user.role === 'teacher' || user.role === 'admin');
}

/**
 * Check if a user can access student data.
 * @param {Object} user - User object with role and studentId properties
 * @param {number} studentId - Target student ID
 * @returns {boolean} True if user can access this student's data
 */
function canAccessStudent(user, studentId) {
  if (!user) return false;
  // Admin and teacher can access all students
  if (['admin', 'teacher'].includes(user.role)) return true;
  // Student can only access their own data
  if (user.role === 'student' && user.studentId === studentId) return true;
  return false;
}

/**
 * Update last login timestamp.
 */
async function updateLastLogin(id) {
  await pool.query(
    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
    [id]
  );
}

/**
 * Verify user is active.
 */
async function isUserActive(id) {
  const [rows] = await pool.query(
    'SELECT is_active FROM users WHERE id = ?',
    [id]
  );
  return rows.length ? Boolean(rows[0].is_active) : false;
}

/**
 * Ensure audit_logs table exists.
 */
async function ensureAuditLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NULL,
      action VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id INT UNSIGNED NULL,
      metadata JSON NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_action (action),
      INDEX idx_resource (resource_type, resource_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Log an audit event.
 */
async function logAuditEvent({ userId, action, resourceType, resourceId, metadata, ipAddress, userAgent }) {
  const sanitizedMetadata = metadata === undefined || metadata === null
    ? null
    : sanitizeAuditMetadata(metadata);
  const safeUserAgent = typeof userAgent === 'string' ? userAgent.slice(0, 1000) : null;

  await pool.query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      resourceType,
      resourceId,
      sanitizedMetadata !== null ? JSON.stringify(sanitizedMetadata) : null,
      ipAddress,
      safeUserAgent,
    ]
  );
}

/**
 * Get audit logs with pagination and filters.
 */
async function getAuditLogs({ page = 1, size = 50, action, resourceType, userId }) {
  const offset = (page - 1) * size;
  const conditions = [];
  const values = [];

  if (action) {
    conditions.push('action = ?');
    values.push(action);
  }
  if (resourceType) {
    conditions.push('resource_type = ?');
    values.push(resourceType);
  }
  if (userId) {
    conditions.push('user_id = ?');
    values.push(userId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [logs] = await pool.query(
    `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, size, offset]
  );

  const [{ total }] = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`,
    values
  );

  return { logs, total, page, totalPages: Math.ceil(total / size) };
}

module.exports = {
  ensureUsersTable,
  ensureAuditLogsTable,
  registerUser,
  loginUser,
  findById,
  getUserById,
  getUserByEmail,
  emailExists,
  listUsers,
  deleteUser,
  createUser,
  updateUser,
  updateLastLogin,
  isUserActive,
  logAuditEvent,
  getAuditLogs,
  isAdmin,
  isTeacherOrAdmin,
  canAccessStudent,
};