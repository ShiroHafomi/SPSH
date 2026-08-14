'use strict';

/**
 * Process-local sliding-window rate limiter with bounded key storage.
 * Multi-replica deployments must enforce equivalent shared proxy/WAF limits or
 * replace this store with a shared implementation.
 */
const CLEANUP_MS = 60_000;
const isDev = process.env.NODE_ENV !== 'production';

function envInteger(name, fallback, { min = 1, max = 1_000_000 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

const MAX_TRACKED_KEYS = envInteger('RATE_LIMIT_MAX_KEYS', 5_000, { max: 100_000 });

function createRateLimiter({
  windowMs,
  max,
  devMax,
  devWindowMs,
  maxKeys = MAX_TRACKED_KEYS,
  now = Date.now,
}) {
  const effectiveMax = isDev && devMax !== undefined ? devMax : max;
  const effectiveWindowMs = isDev && devWindowMs !== undefined ? devWindowMs : windowMs;
  for (const [field, value] of [
    ['windowMs', effectiveWindowMs],
    ['max', effectiveMax],
    ['maxKeys', maxKeys],
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${field} must be a positive safe integer.`);
    }
  }

  const hits = new Map();
  let cleanupInterval = null;

  function pruneExpired(currentTime) {
    const cutoff = currentTime - effectiveWindowMs;
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((timestamp) => timestamp > cutoff);
      if (fresh.length === 0) hits.delete(key);
      else if (fresh.length !== timestamps.length) hits.set(key, fresh);
    }
  }

  function evictOldestFor(newKey) {
    if (hits.has(newKey)) return;
    while (hits.size >= maxKeys) {
      const oldest = hits.keys().next();
      if (oldest.done) break;
      hits.delete(oldest.value);
    }
  }

  function ensureCleanup() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => pruneExpired(now()), CLEANUP_MS);
    cleanupInterval.unref();
  }

  function check(rawKey) {
    ensureCleanup();
    const currentTime = now();
    const key = String(rawKey || 'unknown').slice(0, 512);
    const cutoff = currentTime - effectiveWindowMs;
    const timestamps = (hits.get(key) || []).filter((timestamp) => timestamp > cutoff);

    if (timestamps.length >= effectiveMax) {
      const resetAt = timestamps[0] + effectiveWindowMs;
      return {
        allowed: false,
        limit: effectiveMax,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - currentTime) / 1000)),
      };
    }

    timestamps.push(currentTime);
    if (!hits.has(key) && hits.size >= maxKeys) pruneExpired(currentTime);
    evictOldestFor(key);
    // Refresh insertion order so capacity eviction approximates least-recent use.
    hits.delete(key);
    hits.set(key, timestamps);
    return {
      allowed: true,
      limit: effectiveMax,
      remaining: effectiveMax - timestamps.length,
      resetAt: timestamps[0] + effectiveWindowMs,
      retryAfterSeconds: 0,
    };
  }

  function reset(rawKey) {
    hits.delete(String(rawKey || 'unknown').slice(0, 512));
  }

  function close() {
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = null;
    hits.clear();
  }

  return {
    check,
    close,
    reset,
    size: () => hits.size,
    windowMs: effectiveWindowMs,
  };
}

function configuredLimiter(prefix, defaults) {
  return createRateLimiter({
    windowMs: envInteger(`${prefix}_WINDOW_MS`, defaults.windowMs, { min: 1_000, max: 86_400_000 }),
    max: envInteger(`${prefix}_MAX`, defaults.max, { max: 100_000 }),
    devMax: defaults.devMax,
    devWindowMs: defaults.devWindowMs || defaults.windowMs,
  });
}

const loginLimiter = configuredLimiter('RATE_LIMIT_LOGIN', {
  windowMs: 15 * 60 * 1000,
  max: 5,
  devMax: 50,
});
const registerLimiter = configuredLimiter('RATE_LIMIT_REGISTER', {
  windowMs: 60 * 60 * 1000,
  max: 3,
  devMax: 50,
});
const refreshLimiter = configuredLimiter('RATE_LIMIT_REFRESH', {
  windowMs: 15 * 60 * 1000,
  max: 30,
  devMax: 200,
});
const predictionLimiter = configuredLimiter('RATE_LIMIT_PREDICTION', {
  windowMs: 15 * 60 * 1000,
  max: 30,
  devMax: 200,
});
const studentAiLimiter = configuredLimiter('RATE_LIMIT_STUDENT_AI', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  devMax: 200,
});
const teacherAiLimiter = configuredLimiter('RATE_LIMIT_TEACHER_AI', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  devMax: 200,
});
const adminAiLimiter = configuredLimiter('RATE_LIMIT_ADMIN_AI', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  devMax: 200,
});
const adminBulkAiLimiter = configuredLimiter('RATE_LIMIT_ADMIN_BULK_AI', {
  windowMs: 60 * 60 * 1000,
  max: 5,
  devMax: 100,
});

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function authenticatedRateLimitKey(req) {
  return `user:${req.user?.id || 'anonymous'}|ip:${requestIp(req)}`;
}

function setRateLimitHeaders(res, result, windowMs) {
  const resetSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.set('RateLimit-Policy', `${result.limit};w=${Math.ceil(windowMs / 1000)}`);
  res.set('RateLimit-Limit', String(result.limit));
  res.set('RateLimit-Remaining', String(result.remaining));
  res.set('RateLimit-Reset', String(resetSeconds));
  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
}

function rateLimitMiddleware(limiter, { keyGenerator = requestIp } = {}) {
  return (req, res, next) => {
    const result = limiter.check(keyGenerator(req));
    setRateLimitHeaders(res, result, limiter.windowMs);

    if (!result.allowed) {
      const retryAfter = result.retryAfterSeconds || 1;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many attempts. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };
}

module.exports = {
  adminAiLimiter,
  adminBulkAiLimiter,
  authenticatedRateLimitKey,
  createRateLimiter,
  loginLimiter,
  predictionLimiter,
  rateLimitMiddleware,
  refreshLimiter,
  registerLimiter,
  studentAiLimiter,
  teacherAiLimiter,
};
