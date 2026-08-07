/**
 * JWT Utility functions for token generation and verification.
 */
const jwt = require('jsonwebtoken');
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
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
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate refresh token with minimal payload.
 */
function generateRefreshToken(userId) {
  const payload = { id: userId };
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Verify access token.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Verify refresh token.
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
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
  res.clearCookie('access_token', COOKIE_OPTIONS);
  res.clearCookie('refresh_token', COOKIE_OPTIONS);
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