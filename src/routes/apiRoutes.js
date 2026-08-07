/**
 * API Routes — all JSON endpoints for the SPA frontend.
 * Mounted at /api in app.js.
 */
const express = require('express');
const { requireApiAuth, requireApiAdmin } = require('../middleware/apiAuth');
const { loginLimiter, registerLimiter, rateLimitMiddleware } = require('../utils/rateLimiter');
const {
  apiLogin,
  apiRegister,
  apiLogout,
  apiMe,
  apiDashboardStats,
  apiAtRiskStudents,
  apiFeedback,
  apiListStudents,
  apiGetStudent,
  apiCreateStudent,
  apiUpdateStudent,
  apiDeleteStudent,
  apiListUsers,
  apiDeleteUser,
  apiPredict,
  apiAdminAnalytics,
  apiAdminListStudents,
  apiAdminBulkExport,
  apiAdminBulkAiEvaluate,
  apiAdminGenerateIntervention,
  apiAdminSummarizeHabits,
  apiAdminAtRisk,
} = require('../controllers/apiController');

const router = express.Router();

// ─── Auth (no auth required) — rate-limited ───────────────────────────────────
router.post('/auth/login', rateLimitMiddleware(loginLimiter), apiLogin);
router.post('/auth/register', rateLimitMiddleware(registerLimiter), apiRegister);

// ─── Auth (requires auth) ────────────────────────────────────────────────────
router.post('/auth/logout', requireApiAuth, apiLogout);
router.get('/me', requireApiAuth, apiMe);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard/stats', requireApiAuth, apiDashboardStats);
router.get('/dashboard/at-risk', requireApiAuth, apiAtRiskStudents);

// ─── Students ────────────────────────────────────────────────────────────────
router.get('/students', requireApiAuth, apiListStudents);
router.get('/students/:id', requireApiAuth, apiGetStudent);
router.post('/students', requireApiAuth, apiCreateStudent);
router.post('/students/:id', requireApiAuth, apiUpdateStudent);
router.post('/students/:id/delete', requireApiAuth, apiDeleteStudent);

// ─── Admin (requires admin) ───────────────────────────────────────────────────
// Analytics
router.get('/admin/analytics', requireApiAuth, requireApiAdmin, apiAdminAnalytics);

// At-Risk Students
router.get('/admin/at-risk', requireApiAuth, requireApiAdmin, apiAdminAtRisk);

// Student management (filtered, with search/sort/pagination)
router.get('/admin/students', requireApiAuth, requireApiAdmin, apiAdminListStudents);

// Bulk operations
router.post('/admin/students/bulk-export', requireApiAuth, requireApiAdmin, apiAdminBulkExport);
router.post('/admin/students/bulk-ai-evaluate', requireApiAuth, requireApiAdmin, apiAdminBulkAiEvaluate);

// Individual student AI actions
router.post('/admin/students/:id/intervention', requireApiAuth, requireApiAdmin, apiAdminGenerateIntervention);
router.post('/admin/students/:id/summarize-habits', requireApiAuth, requireApiAdmin, apiAdminSummarizeHabits);

// User management
router.get('/admin/users', requireApiAuth, requireApiAdmin, apiListUsers);
router.post('/admin/users/:id/delete', requireApiAuth, requireApiAdmin, apiDeleteUser);

// ─── ML Prediction ────────────────────────────────────────────────────────────
router.post('/predict', requireApiAuth, apiPredict);
router.post('/feedback', requireApiAuth, apiFeedback);

module.exports = router;