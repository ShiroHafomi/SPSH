/**
 * JWT Configuration and utilities.
 * Access tokens: 15 minutes
 * Refresh tokens: 7 days (stored in HttpOnly cookie)
 */
require('dotenv').config();
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');

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