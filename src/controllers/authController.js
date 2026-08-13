/**
 * Auth Controller — JWT-based authentication endpoints.
 * Handles login, logout, token refresh, and current user profile.
 */
const authService = require('../services/authService');
const {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  verifyRefreshToken,
} = require('../utils/jwtUtils');
const { logAuditEvent } = require('../services/authService');

/**
 * POST /api/auth/login
 * Authenticate user and return JWT tokens in HttpOnly cookies.
 */
async function apiLogin(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Normalize email
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const user = await authService.loginUser({ email: normalizedEmail, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated. Contact administrator.' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user.id);

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    // Update last login
    await authService.updateLastLogin(user.id);

    // Log audit event
    await logAuditEvent({
      userId: user.id,
      action: 'LOGIN',
      resourceType: 'auth',
      resourceId: user.id,
      metadata: { method: 'password' },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    // Return user object (without sensitive data)
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.student_id,
        department: user.department,
      },
    });
  } catch (err) {
    console.error('[apiLogin]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

/**
 * POST /api/auth/logout
 * Clear auth cookies and optionally invalidate refresh token.
 */
async function apiLogout(req, res) {
  try {
    // Log audit event if user is authenticated
    if (req.user) {
      await logAuditEvent({
        userId: req.user.id,
        action: 'LOGOUT',
        resourceType: 'auth',
        resourceId: req.user.id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'],
      });
    }
  } catch (err) {
    console.error('[apiLogout] audit log failed:', err);
  }

  // Clear cookies
  clearAuthCookies(res);
  res.json({ ok: true });
}

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token cookie.
 */
async function apiRefresh(req, res) {
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required', code: 'REFRESH_TOKEN_REQUIRED' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await authService.getUserById(decoded.id);

    if (!user || !user.is_active) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    // Set new access token cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.student_id,
        department: user.department,
      },
    });
  } catch (err) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Session expired, please login again', code: 'SESSION_EXPIRED' });
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user profile.
 */
async function apiMe(req, res) {
  if (!req.user) {
    return res.json({ user: null });
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      studentId: req.user.studentId,
      department: req.user.department,
    },
  });
}

/**
 * POST /api/auth/register (DISABLED - Admin only creates users)
 * This endpoint is disabled. Users can only be created by admin via /api/admin/users
 */
async function apiRegister(req, res) {
  return res.status(403).json({
    error: 'Public registration is disabled. Contact administrator for account creation.',
    code: 'REGISTRATION_DISABLED',
  });
}

module.exports = {
  apiLogin,
  apiLogout,
  apiRefresh,
  apiMe,
  apiRegister,
};