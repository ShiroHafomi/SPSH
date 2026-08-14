'use strict';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEV_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

function parseBoundedInteger(value, fallback, { name, min = 1, max }) {
  if (value === undefined || value === null || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeOrigin(value, name = 'origin') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty absolute URL`);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must use http or https without embedded credentials`);
  }

  if (parsed.origin === 'null') {
    throw new Error(`${name} does not have a valid origin`);
  }

  return parsed.origin;
}

function parseTrustProxy(value) {
  if (value === undefined || value === null || String(value).trim() === '') return false;

  const raw = String(value).trim();
  if (/^true$/i.test(raw) || raw === '*') {
    throw new Error('TRUST_PROXY must be a hop count or explicit proxy address/subnet, not true or *');
  }
  if (/^false$/i.test(raw) || raw === '0') return false;

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (!Number.isSafeInteger(hops) || hops < 1 || hops > 10) {
      throw new Error('TRUST_PROXY hop count must be between 1 and 10');
    }
    return hops;
  }

  const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0 || entries.length > 20) {
    throw new Error('TRUST_PROXY must contain 1 to 20 explicit proxy entries');
  }
  if (entries.some((entry) => entry.length > 128 || /[\r\n]/.test(entry))) {
    throw new Error('TRUST_PROXY contains an invalid proxy entry');
  }

  return entries;
}

function createSecurityConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const allowedOrigins = new Set();

  if (env.APP_ORIGIN) {
    const appOrigin = normalizeOrigin(env.APP_ORIGIN, 'APP_ORIGIN');
    if (isProduction && new URL(appOrigin).protocol !== 'https:') {
      throw new Error('APP_ORIGIN must use https when NODE_ENV=production');
    }
    allowedOrigins.add(appOrigin);
  } else if (isProduction) {
    throw new Error('APP_ORIGIN is required when NODE_ENV=production');
  }

  if (!isProduction) {
    DEV_ORIGINS.forEach((origin) => allowedOrigins.add(origin));
    const backendPort = parseBoundedInteger(env.PORT, 3000, {
      name: 'PORT',
      min: 1,
      max: 65535,
    });
    allowedOrigins.add(`http://127.0.0.1:${backendPort}`);
    allowedOrigins.add(`http://localhost:${backendPort}`);
  }

  return {
    isProduction,
    allowedOrigins,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    jsonBodyLimit: parseBoundedInteger(env.JSON_BODY_LIMIT_BYTES, 32 * 1024, {
      name: 'JSON_BODY_LIMIT_BYTES',
      min: 1024,
      max: 256 * 1024,
    }),
    urlencodedBodyLimit: parseBoundedInteger(env.URLENCODED_BODY_LIMIT_BYTES, 16 * 1024, {
      name: 'URLENCODED_BODY_LIMIT_BYTES',
      min: 1024,
      max: 128 * 1024,
    }),
    urlencodedParameterLimit: parseBoundedInteger(env.URLENCODED_PARAMETER_LIMIT, 100, {
      name: 'URLENCODED_PARAMETER_LIMIT',
      min: 1,
      max: 1000,
    }),
  };
}

function hasBearerAuthorization(req) {
  const authorization = req.get('Authorization') || '';
  return /^Bearer\s+\S+$/i.test(authorization);
}

function getRequestOrigin(req) {
  const origin = req.get('Origin');
  if (origin) {
    try {
      return normalizeOrigin(origin, 'Origin');
    } catch {
      return null;
    }
  }

  const referer = req.get('Referer');
  if (referer) {
    try {
      return normalizeOrigin(referer, 'Referer');
    } catch {
      return null;
    }
  }

  return null;
}

function createRequestProvenanceMiddleware({ allowedOrigins, isProduction }) {
  return function requestProvenance(req, res, next) {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const hasAuthCookie = Boolean(
      req.cookies?.access_token || req.cookies?.refresh_token
    );
    if (hasBearerAuthorization(req) && !hasAuthCookie) return next();

    const requestOrigin = getRequestOrigin(req);
    if (requestOrigin) {
      if (!allowedOrigins.has(requestOrigin)) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }

      const fetchSite = (req.get('Sec-Fetch-Site') || '').toLowerCase();
      if (fetchSite && fetchSite !== 'same-origin') {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
      return next();
    }

    if (isProduction && hasAuthCookie) {
      return res.status(403).json({ error: 'Request origin could not be verified.' });
    }

    return next();
  };
}

module.exports = {
  MUTATING_METHODS,
  createRequestProvenanceMiddleware,
  createSecurityConfig,
  getRequestOrigin,
  hasBearerAuthorization,
  normalizeOrigin,
  parseTrustProxy,
};
