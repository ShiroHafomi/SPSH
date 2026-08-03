/**
 * API Auth Middleware — JSON-response equivalents of the existing auth guards.
 * These are used by API routes to return structured JSON instead of redirects/HTML.
 */

/**
 * Require a valid session for API access.
 * Returns 401 JSON if not authenticated.
 */
function requireApiAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in first.' });
  }
  next();
}

/**
 * Require admin role for API access.
 * Must be used after requireApiAuth (or after currentUser middleware).
 * Returns 403 JSON if not admin.
 */
function requireApiAdmin(req, res, next) {
  const user = res.locals.currentUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  next();
}

module.exports = { requireApiAuth, requireApiAdmin };