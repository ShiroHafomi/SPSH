/**
 * Auth Middleware — route protection helpers.
 *
 * requireAuth    — redirects unauthenticated users to /login
 * redirectIfAuth — redirects already-logged-in users away from login/register
 * requireAdmin   — returns 403 for non-admin users
 */

/**
 * Protect routes behind authentication.
 * Redirects to /login with an error message if no session exists.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login?error=Please+log+in+first');
  }
  next();
}

/**
 * Redirect users who are already logged in away from login/register pages.
 */
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  next();
}

/**
 * Require admin role to access a route.
 * Must be used after requireAuth (or after currentUser middleware has run).
 * Returns a 403 error page if the user is not an admin.
 */
function requireAdmin(req, res, next) {
  if (!res.locals.currentUser || res.locals.currentUser.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'Admin access required.',
      backLink: '/',
    });
  }
  next();
}

module.exports = { requireAuth, redirectIfAuth, requireAdmin };