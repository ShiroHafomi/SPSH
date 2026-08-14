'use strict';

const crypto = require('crypto');
const { pool } = require('../config/db');
const { REFRESH_TOKEN_TTL_MS } = require('../config/jwt');
const {
  decodeToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwtUtils');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let operationCount = 0;

class AuthSessionError extends Error {
  constructor(message, code, { preserveCookies = false } = {}) {
    super(message);
    this.name = 'AuthSessionError';
    this.code = code;
    this.preserveCookies = preserveCookies;
  }
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest();
}

function tokensMatch(actual, expected) {
  const actualBuffer = Buffer.isBuffer(actual) ? actual : Buffer.from(actual);
  const expectedBuffer = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function validateClaims(decoded) {
  const userId = parsePositiveSafeInteger(decoded?.id);
  const sessionId = decoded?.jti;
  if (userId === null || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
    throw new AuthSessionError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }
  return { userId, sessionId };
}

async function ensureAuthSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      token_hash BINARY(32) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      replaced_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_used_at DATETIME(3) NULL,
      INDEX idx_auth_sessions_user (user_id),
      INDEX idx_auth_sessions_expiry (expires_at),
      CONSTRAINT fk_auth_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function insertSession(executor, userId) {
  const sessionId = crypto.randomUUID();
  const refreshToken = generateRefreshToken(userId, sessionId);
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await executor.query(
    `INSERT INTO auth_sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [sessionId, userId, tokenHash, expiresAt]
  );

  return { sessionId, refreshToken, expiresAt };
}

function scheduleBoundedCleanup() {
  operationCount = (operationCount + 1) % 100;
  if (operationCount !== 0) return;

  pool.query(
    `DELETE FROM auth_sessions
     WHERE expires_at < NOW(3)
        OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(3), INTERVAL 7 DAY))
     ORDER BY expires_at
     LIMIT 100`
  ).catch((error) => {
    console.error('[authSessionService] session cleanup failed:', error.message);
  });
}

async function issueRefreshSession(userId) {
  const parsedUserId = parsePositiveSafeInteger(userId);
  if (parsedUserId === null) throw new TypeError('User ID must be a positive integer');

  const session = await insertSession(pool, parsedUserId);
  scheduleBoundedCleanup();
  return session;
}

async function rotateRefreshSession(refreshToken) {
  let claims;
  try {
    claims = validateClaims(verifyRefreshToken(refreshToken));
  } catch (error) {
    if (error instanceof AuthSessionError) throw error;
    throw new AuthSessionError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [sessions] = await connection.query(
      `SELECT session_id, user_id, token_hash, expires_at, revoked_at, replaced_by
       FROM auth_sessions WHERE session_id = ? FOR UPDATE`,
      [claims.sessionId]
    );
    const session = sessions[0];

    if (!session || session.user_id !== claims.userId || !tokensMatch(session.token_hash, tokenHash)) {
      throw new AuthSessionError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }
    if (session.revoked_at || session.replaced_by) {
      throw new AuthSessionError('Refresh token has already been used', 'REFRESH_TOKEN_REPLAYED', {
        preserveCookies: true,
      });
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      throw new AuthSessionError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    }

    const [users] = await connection.query(
      `SELECT id, email, name, role, student_id, department, is_active
       FROM users WHERE id = ?`,
      [claims.userId]
    );
    const user = users[0];
    if (!user || !user.is_active) {
      throw new AuthSessionError('Account is unavailable', 'ACCOUNT_UNAVAILABLE');
    }

    const replacement = await insertSession(connection, claims.userId);
    const [updateResult] = await connection.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW(3), last_used_at = NOW(3), replaced_by = ?
       WHERE session_id = ? AND revoked_at IS NULL`,
      [replacement.sessionId, claims.sessionId]
    );
    if (updateResult.affectedRows !== 1) {
      throw new AuthSessionError('Refresh token has already been used', 'REFRESH_TOKEN_REPLAYED', {
        preserveCookies: true,
      });
    }

    await connection.commit();
    scheduleBoundedCleanup();
    return { user, ...replacement };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('[authSessionService] rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeRefreshSession(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken === '') return false;

  let claims;
  try {
    claims = validateClaims(decodeToken(refreshToken));
  } catch {
    return false;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const [result] = await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, NOW(3)), last_used_at = NOW(3)
     WHERE session_id = ? AND user_id = ? AND token_hash = ?`,
    [claims.sessionId, claims.userId, tokenHash]
  );
  return result.affectedRows > 0;
}

async function revokeAllUserSessions(userId, executor = pool) {
  const parsedUserId = parsePositiveSafeInteger(userId);
  if (parsedUserId === null) return 0;

  const [result] = await executor.query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, NOW(3))
     WHERE user_id = ? AND revoked_at IS NULL`,
    [parsedUserId]
  );
  return result.affectedRows;
}

module.exports = {
  AuthSessionError,
  ensureAuthSessionsTable,
  hashRefreshToken,
  issueRefreshSession,
  revokeAllUserSessions,
  revokeRefreshSession,
  rotateRefreshSession,
  tokensMatch,
};
