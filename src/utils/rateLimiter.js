/**
 * In-Memory Rate Limiter — simple sliding-window rate limiter for auth endpoints.
 * No external dependencies — uses Map with periodic cleanup.
 *
 * Usage:
 *   const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
 *   app.use('/api/auth/login', rateLimitMiddleware(loginLimiter));
 */

const CLEANUP_MS = 60_000; // sweep expired entries every 60s

function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> [timestamp, ...]
  let cleanupInterval = null;

  function ensureCleanup() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - windowMs;
      for (const [key, timestamps] of hits) {
        const fresh = timestamps.filter((t) => t > cutoff);
        if (fresh.length === 0) hits.delete(key);
        else hits.set(key, fresh);
      }
    }, CLEANUP_MS);
    cleanupInterval.unref(); // don't keep process alive
  }

  /**
   * Record a hit and return whether the request is allowed.
   * @param {string} key — unique identifier (IP, email, or combo)
   * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
   */
  function check(key) {
    ensureCleanup();
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      const retryAfterSeconds = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return {
      allowed: true,
      remaining: max - timestamps.length,
      retryAfterSeconds: 0,
    };
  }

  /** Clear hits for a key — call on successful login to reward success. */
  function reset(key) {
    hits.delete(key);
  }

  return { check, reset };
}

// ─── Pre-configured limiters ──────────────────────────────────────────────────

/** Login: 5 attempts per 15 minutes per IP */
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

/** Register: 3 accounts per hour per IP */
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
});

/**
 * Express middleware factory. Returns middleware that rate-limits based on IP.
 * @param {object} limiter — a rate limiter instance
 */
function rateLimitMiddleware(limiter) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const result = limiter.check(ip);

    if (!result.allowed) {
      const retryAfter = result.retryAfterSeconds || 60;
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
  createRateLimiter,
  loginLimiter,
  registerLimiter,
  rateLimitMiddleware,
};