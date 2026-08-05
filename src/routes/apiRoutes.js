/**
 * API Routes — all JSON endpoints for the SPA frontend.
 * Mounted at /api in app.js.
 */
const express = require('express');
const { requireApiAuth, requireApiAdmin } = require('../middleware/apiAuth');
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
} = require('../controllers/apiController');

const router = express.Router();

// ─── Auth (no auth required) ──────────────────────────────────────────────────
router.post('/auth/login', apiLogin);
router.post('/auth/register', apiRegister);

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

// ─── Admin ───────────────────────────────────────────────────────────────────
router.get('/admin/users', requireApiAuth, requireApiAdmin, apiListUsers);
router.post('/admin/users/:id/delete', requireApiAuth, requireApiAdmin, apiDeleteUser);

// ─── ML Prediction ────────────────────────────────────────────────────────────
router.post('/predict', requireApiAuth, apiPredict);
router.post('/feedback', requireApiAuth, apiFeedback);

module.exports = router;