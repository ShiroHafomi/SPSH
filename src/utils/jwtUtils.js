/**
 * JWT Utility functions for token generation and verification.
 */
const jwt = require('jsonwebtoken');
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  COOKIE_OPTIONS,
  ACCESS_COOKIE_OPTIONS,
} = require('../config/jwt');

/**
 * Generate access token with user payload.
 */
function generateAccessToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.student_id || user.studentId,
    token_use: 'access',
  };
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(user.id),
  });
}

/**
 * Generate refresh token with minimal payload.
 */
function generateRefreshToken(userId, sessionId) {
  if (!sessionId) throw new Error('Refresh session ID is required');
  const payload = { id: userId, token_use: 'refresh' };
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: String(userId),
    jwtid: sessionId,
  });
}

/**
 * Verify access token.
 */
function verifyAccessToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (decoded.token_use !== 'access') throw new jwt.JsonWebTokenError('Invalid token use');
  return decoded;
}

/**
 * Verify refresh token.
 */
function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (decoded.token_use !== 'refresh' || !decoded.jti) {
    throw new jwt.JsonWebTokenError('Invalid token use');
  }
  return decoded;
}

/**
 * Decode token without verification (for debugging).
 */
function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Set auth cookies on response.
 */
function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('refresh_token', refreshToken, COOKIE_OPTIONS);
}

/**
 * Clear auth cookies.
 */
function clearAuthCookies(res) {
  const accessClearOptions = { ...ACCESS_COOKIE_OPTIONS };
  const refreshClearOptions = { ...COOKIE_OPTIONS };
  delete accessClearOptions.maxAge;
  delete refreshClearOptions.maxAge;
  res.clearCookie('access_token', accessClearOptions);
  res.clearCookie('refresh_token', refreshClearOptions);
}

/**
 * Extract token from request (cookie or Authorization header).
 */
function extractToken(req) {
  // Check cookie first
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Extract refresh token from request.
 */
function extractRefreshToken(req) {
  if (req.cookies?.refresh_token) {
    return req.cookies.refresh_token;
  }
  return null;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  setAuthCookies,
  clearAuthCookies,
  extractToken,
  extractRefreshToken,
};