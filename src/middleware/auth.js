/**
 * Authentication Middleware - JWT-based with fallback to session.
 * Provides requireAuth, requireRole, and optionalAuth middleware.
 */
const {
  verifyAccessToken,
  extractToken,
  extractRefreshToken,
  generateAccessToken,
  verifyRefreshToken,
  clearAuthCookies,
} = require('../utils/jwtUtils');
const { findById } = require('../services/authService');

function toRequestUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.student_id,
    department: user.department,
  };
}

function setAccessTokenCookie(res, accessToken) {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  });
}

/**
 * Middleware to require valid authentication.
 * Attaches req.user with decoded token payload.
 * Returns 401 JSON if not authenticated or token invalid.
 */
async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    // Access cookies expire before refresh cookies. Recover the session when the
    // browser still has a valid refresh token instead of forcing a new login.
    if (extractRefreshToken(req)) {
      return handleTokenRefresh(req, res, next);
    }
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }

  try {
    const decoded = verifyAccessToken(token);

    // Fetch fresh user data to check is_active status
    const user = await findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }

    // Attach user to request
    req.user = toRequestUser(user);

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // Try to refresh using refresh token
      return handleTokenRefresh(req, res, next);
    }
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

/**
 * Handle token refresh when access token expires.
 */
async function handleTokenRefresh(req, res, next) {
  const refreshToken = extractRefreshToken(req);

  if (!refreshToken) {
    return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await findById(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    // Set new access token cookie
    setAccessTokenCookie(res, newAccessToken);

    // Attach user and continue
    req.user = toRequestUser(user);

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired, please login again', code: 'SESSION_EXPIRED' });
  }
}

/**
 * Middleware to require specific role(s).
 * Usage: requireRole('admin', 'teacher') or requireRole(['admin', 'teacher'])
 * Must be used AFTER requireAuth.
 */
function requireRole(...allowedRoles) {
  // Flatten array if passed as single array
  const roles = Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: roles,
        currentRole: req.user.role,
      });
    }

    next();
  };
}

/**
 * Session probe authentication — anonymous requests continue, but existing
 * access/refresh cookies are validated and may hydrate/refresh req.user.
 * Used by GET /auth/me so a logged-out page boot is a normal 200 response.
 */
async function sessionAuth(req, res, next) {
  const accessToken = extractToken(req);
  const refreshToken = extractRefreshToken(req);

  if (!accessToken && !refreshToken) {
    return next();
  }

  if (accessToken) {
    try {
      const decoded = verifyAccessToken(accessToken);
      const user = await findById(decoded.id);
      if (user?.is_active) {
        req.user = toRequestUser(user);
        return next();
      }
    } catch {
      // Try the refresh cookie below. Invalid/stale cookies become anonymous.
    }
  }

  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await findById(decoded.id);
      if (user?.is_active) {
        setAccessTokenCookie(res, generateAccessToken(user));
        req.user = toRequestUser(user);
        return next();
      }
    } catch {
      // Stale session probes are anonymous, not failed API requests.
    }
  }

  clearAuthCookies(res);
  return next();
}

/**
 * Optional authentication - attaches user if token valid, continues anyway.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await findById(decoded.id);

    if (user && user.is_active) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.student_id,
        department: user.department,
      };
    }
  } catch (err) {
    // Ignore invalid tokens in optional auth
  }

  next();
}

/**
 * Require admin role specifically.
 */
function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

/**
 * Require teacher or admin role.
 */
function requireTeacherOrAdmin(req, res, next) {
  return requireRole('admin', 'teacher')(req, res, next);
}

/**
 * Require student role specifically.
 */
function requireStudent(req, res, next) {
  return requireRole('student')(req, res, next);
}

/**
 * Require user to be authenticated (any role).
 */
function requireAnyRole(req, res, next) {
  return requireAuth(req, res, next);
}

/**
 * Require student access - students can only access their own data,
 * teachers and admins can access any student's data.
 */
function requireStudentAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }

  // Admin and teacher can access any student
  if (req.user.role === 'admin' || req.user.role === 'teacher') {
    return next();
  }

  // Student can only access their own data
  // Check if the requested studentId matches their own
  const requestedStudentId = parseInt(req.params.id || req.params.studentId || req.body.studentId, 10);
  if (req.user.studentId && requestedStudentId && req.user.studentId !== requestedStudentId) {
    return res.status(403).json({
      error: 'Students can only access their own data',
      code: 'FORBIDDEN',
    });
  }

  next();
}

module.exports = {
  requireAuth,
  requireRole,
  sessionAuth,
  optionalAuth,
  requireStudentAccess,
  requireAdmin,
  requireTeacherOrAdmin,
  requireStudent,
  requireAnyRole,
};