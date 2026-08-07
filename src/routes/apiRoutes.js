/**
 * API Routes — all JSON endpoints for the SPA frontend.
 * Mounted at /api in app.js.
 */
const express = require('express');
const { requireAuth, requireRole, requireStudentAccess } = require('../middleware/auth');
const { loginLimiter, registerLimiter, rateLimitMiddleware } = require('../utils/rateLimiter');

// Auth
const {
  apiLogin,
  apiLogout,
  apiRefresh,
  apiMe,
  apiRegister,
} = require('../controllers/authController');

// Dashboard & Students
const {
  apiDashboardStats,
  apiAtRiskStudents,
  apiFeedback,
  apiListStudents,
  apiGetStudent,
  apiCreateStudent,
  apiUpdateStudent,
  apiDeleteStudent,
  apiPredict,
} = require('../controllers/apiController');

// Admin
const {
  apiListUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiGetAuditLogs,
  apiAdminAnalytics,
  apiAdminListStudents,
  apiAdminBulkExport,
  apiAdminBulkAiEvaluate,
  apiAdminGenerateIntervention,
  apiAdminSummarizeHabits,
  apiAdminAtRisk,
} = require('../controllers/adminController');

// Teacher
const {
  apiTeacherAnalytics,
  apiTeacherStudents,
  apiGetTeacherStudent,
  apiUpdateTeacherStudent,
  apiTeacherAtRisk,
  apiTeacherAiCounsel,
} = require('../controllers/teacherController');

// Student
const {
  apiStudentProfile,
  apiStudentSimulate,
  apiStudentAdvisor,
} = require('../controllers/studentController');

const router = express.Router();

// ─── Auth (no auth required) — rate-limited ───────────────────────────────────
router.post('/auth/login', rateLimitMiddleware(loginLimiter), apiLogin);
router.post('/auth/logout', apiLogout);
router.post('/auth/refresh', apiRefresh);
router.post('/auth/register', rateLimitMiddleware(registerLimiter), apiRegister);

// ─── Auth (requires auth) ────────────────────────────────────────────────────
router.get('/auth/me', requireAuth, apiMe);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard/stats', requireAuth, apiDashboardStats);
router.get('/dashboard/at-risk', requireAuth, apiAtRiskStudents);

// ─── Students ────────────────────────────────────────────────────────────────
router.get('/students', requireAuth, apiListStudents);
router.get('/students/:id', requireAuth, apiGetStudent);
router.post('/students', requireAuth, apiCreateStudent);
router.post('/students/:id', requireAuth, apiUpdateStudent);
router.post('/students/:id/delete', requireAuth, apiDeleteStudent);

// ─── Admin (requires admin) ───────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(requireAuth, requireRole('admin'));

// Analytics
adminRouter.get('/analytics', apiAdminAnalytics);

// Audit logs
adminRouter.get('/audit-logs', apiGetAuditLogs);

// At-Risk Students
adminRouter.get('/at-risk', apiAdminAtRisk);

// Student management (filtered, with search/sort/pagination)
adminRouter.get('/students', apiAdminListStudents);
adminRouter.post('/students/bulk-export', apiAdminBulkExport);
adminRouter.post('/students/bulk-ai-evaluate', apiAdminBulkAiEvaluate);

// Individual student AI actions
adminRouter.post('/students/:id/intervention', apiAdminGenerateIntervention);
adminRouter.post('/students/:id/summarize-habits', apiAdminSummarizeHabits);

// User management
adminRouter.get('/users', apiListUsers);
adminRouter.post('/users', apiCreateUser);
adminRouter.put('/users/:id', apiUpdateUser);
adminRouter.delete('/users/:id', apiDeleteUser);

router.use('/admin', adminRouter);

// ─── Teacher (requires teacher or admin) ──────────────────────────────────────
const teacherRouter = express.Router();
teacherRouter.use(requireAuth, requireRole('admin', 'teacher'));

// Analytics
teacherRouter.get('/analytics', apiTeacherAnalytics);

// At-Risk Students
teacherRouter.get('/at-risk', apiTeacherAtRisk);

// AI Counsel
teacherRouter.post('/ai-counsel', apiTeacherAiCounsel);

// Student management
teacherRouter.get('/students', apiTeacherStudents);
teacherRouter.get('/students/:id', apiGetTeacherStudent);
teacherRouter.put('/students/:id', apiUpdateTeacherStudent);

router.use('/teacher', teacherRouter);

// ─── Student (requires student) ───────────────────────────────────────────────
const studentRouter = express.Router();
studentRouter.use(requireAuth, requireRole('student'));

// Profile
studentRouter.get('/me/profile', apiStudentProfile);

// What-If Simulator
studentRouter.post('/me/simulate', apiStudentSimulate);

// AI Advisor
studentRouter.get('/me/advisor', apiStudentAdvisor);

router.use('/student', studentRouter);

// ─── ML Prediction ────────────────────────────────────────────────────────────
router.post('/predict', requireAuth, apiPredict);
router.post('/feedback', requireAuth, apiFeedback);

module.exports = router;