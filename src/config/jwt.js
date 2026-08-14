/**
 * JWT Configuration and utilities.
 * Access tokens: 15 minutes
 * Refresh tokens: 7 days (stored in HttpOnly cookie)
 */
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

function getSecret(name, developmentFallback) {
  const value = process.env[name];
  if (value) {
    if (isProduction && Buffer.byteLength(value, 'utf8') < 32) {
      throw new Error(`${name} must be at least 32 bytes when NODE_ENV=production`);
    }
    return value;
  }
  if (isProduction) {
    throw new Error(`${name} is required when NODE_ENV=production`);
  }
  return developmentFallback;
}

// Stable development fallbacks keep local sessions valid across server restarts.
// Production must provide independent high-entropy secrets through the environment.
const JWT_SECRET = getSecret(
  'JWT_SECRET',
  'student-performance-development-access-secret-change-me'
);
const JWT_REFRESH_SECRET = getSecret(
  'JWT_REFRESH_SECRET',
  'student-performance-development-refresh-secret-change-me'
);

if (isProduction && JWT_SECRET === JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different in production');
}

const JWT_ISSUER = process.env.JWT_ISSUER || 'student-performance-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'student-performance-spa';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api',
  maxAge: REFRESH_TOKEN_TTL_MS,
});

const ACCESS_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api',
  maxAge: ACCESS_TOKEN_TTL_MS,
});

module.exports = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  COOKIE_OPTIONS,
  ACCESS_COOKIE_OPTIONS,
};