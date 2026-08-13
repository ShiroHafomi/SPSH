/**
 * JWT Configuration and utilities.
 * Access tokens: 15 minutes
 * Refresh tokens: 7 days (stored in HttpOnly cookie)
 */
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

function getSecret(name, developmentFallback) {
  const value = process.env[name];
  if (value) return value;
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

const ACCESS_TOKEN_EXPIRY = '15m';     // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';      // 7 days

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes in ms
};

module.exports = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  COOKIE_OPTIONS,
  ACCESS_COOKIE_OPTIONS,
};