/**
 * Authentication Middleware - JWT-based with fallback to session.
 * Provides requireAuth, requireRole, and optionalAuth middleware.
 */
const { verifyAccessToken, extractToken, extractRefreshToken, generateAccessToken, verifyRefreshToken } = require('../utils/jwtUtils');
const { findById, isUserActive } = require('../services/authService');

/**
 * Middleware to require valid authentication.
 * Attaches req.user with decoded token payload.
 * Returns 401 JSON if not authenticated or token invalid.
 */
async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
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
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      studentId: user.student_id,
      department: user.department,
    };

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
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    // Attach user and continue
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      studentId: user.student_id,
      department: user.department,
    };

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
 * Middleware to ensure user can only access their own student data.
 * For student role: req.user.studentId must match the requested student.
 * For admin/teacher: allowed to access any student.
 */
function requireStudentAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }

  // Admin and teacher can access all students
  if (['admin', 'teacher'].includes(req.user.role)) {
    return next();
  }

  // Student can only access their own data
  const requestedStudentId = parseInt(req.params.id || req.params.studentId || req.body.student_id, 10);

  if (isNaN(requestedStudentId)) {
    return res.status(400).json({ error: 'Invalid student ID', code: 'INVALID_STUDENT_ID' });
  }

  if (req.user.studentId !== requestedStudentId) {
    return res.status(403).json({ error: 'Access denied to this student record', code: 'FORBIDDEN' });
  }

  next();
}

module.exports = {
  requireAuth,
  requireRole,
  optionalAuth,
  requireStudentAccess,
};