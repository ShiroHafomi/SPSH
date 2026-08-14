'use strict';

const SENSITIVE_KEY = /(?:pass(?:word|phrase)?|secret|token|authorization|cookie|api[_-]?key|credential|session)/i;
const MAX_DEPTH = 6;
const MAX_COLLECTION_SIZE = 100;
const MAX_STRING_LENGTH = 1000;

function sanitizeAuditMetadata(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}[TRUNCATED]`
      : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_COLLECTION_SIZE)
      .map((item) => sanitizeAuditMetadata(item, depth + 1, seen));
    if (value.length > MAX_COLLECTION_SIZE) sanitized.push('[TRUNCATED]');
    return sanitized;
  }

  const sanitized = {};
  const entries = Object.entries(value).slice(0, MAX_COLLECTION_SIZE);
  for (const [key, item] of entries) {
    sanitized[key] = SENSITIVE_KEY.test(key)
      ? '[REDACTED]'
      : sanitizeAuditMetadata(item, depth + 1, seen);
  }
  if (Object.keys(value).length > MAX_COLLECTION_SIZE) {
    sanitized._truncated = true;
  }
  return sanitized;
}

module.exports = {
  SENSITIVE_KEY,
  sanitizeAuditMetadata,
};
