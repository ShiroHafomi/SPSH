/**
 * API Routes — all JSON endpoints for the SPA frontend.
 * Mounted at /api in app.js.
 */
const express = require('express');
const { requireAuth, requireRole, sessionAuth, optionalAuth } = require('../middleware/auth');
const {
  adminAiLimiter,
  adminBulkAiLimiter,
  authenticatedRateLimitKey,
  loginLimiter,
  predictionLimiter,
  rateLimitMiddleware,
  refreshLimiter,
  registerLimiter,
  studentAiLimiter,
  teacherAiLimiter,
} = require('../utils/rateLimiter');

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
  apiAdminMlHealth,
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
  apiStudentUpdateProfile,
} = require('../controllers/studentController');

const router = express.Router();
const authenticatedLimit = (limiter) => rateLimitMiddleware(limiter, {
  keyGenerator: authenticatedRateLimitKey,
});

// ─── Auth (no auth required) — rate-limited ───────────────────────────────────
router.post('/auth/login', rateLimitMiddleware(loginLimiter), apiLogin);
router.post('/auth/logout', optionalAuth, apiLogout);
router.post('/auth/refresh', rateLimitMiddleware(refreshLimiter), apiRefresh);
router.post('/auth/register', rateLimitMiddleware(registerLimiter), apiRegister);

// ─── Auth (requires auth) ────────────────────────────────────────────────────
router.get('/auth/me', sessionAuth, apiMe);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard/stats', requireAuth, apiDashboardStats);
router.get('/dashboard/at-risk', requireAuth, requireRole('admin', 'teacher'), apiAtRiskStudents);

// ─── Students (staff only; students use /student/me/*) ───────────────────────
const requireStudentManagement = [requireAuth, requireRole('admin', 'teacher')];
router.get('/students', ...requireStudentManagement, apiListStudents);
router.get('/students/:id', ...requireStudentManagement, apiGetStudent);
router.post('/students', ...requireStudentManagement, apiCreateStudent);
router.post('/students/:id', ...requireStudentManagement, apiUpdateStudent);
router.post('/students/:id/delete', ...requireStudentManagement, apiDeleteStudent);

// ─── Admin (requires admin) ───────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(requireAuth, requireRole('admin'));

// Analytics
adminRouter.get('/analytics', apiAdminAnalytics);
adminRouter.get('/ml-health', apiAdminMlHealth);

// Audit logs
adminRouter.get('/audit-logs', apiGetAuditLogs);

// At-Risk Students
adminRouter.get('/at-risk', apiAdminAtRisk);

// Student management (filtered, with search/sort/pagination)
adminRouter.get('/students', apiAdminListStudents);
adminRouter.post('/students/bulk-export', apiAdminBulkExport);
adminRouter.post(
  '/students/bulk-ai-evaluate',
  authenticatedLimit(adminBulkAiLimiter),
  apiAdminBulkAiEvaluate
);

// Individual student AI actions
adminRouter.post(
  '/students/:id/intervention',
  authenticatedLimit(adminAiLimiter),
  apiAdminGenerateIntervention
);
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
teacherRouter.post(
  '/ai-counsel',
  authenticatedLimit(teacherAiLimiter),
  apiTeacherAiCounsel
);

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
studentRouter.put('/me/profile', apiStudentUpdateProfile);

// What-If Simulator
studentRouter.post(
  '/me/simulate',
  authenticatedLimit(studentAiLimiter),
  apiStudentSimulate
);

// AI Advisor
studentRouter.get(
  '/me/advisor',
  authenticatedLimit(studentAiLimiter),
  apiStudentAdvisor
);

router.use('/student', studentRouter);

// ─── ML Prediction ────────────────────────────────────────────────────────────
router.post(
  '/predict',
  requireAuth,
  authenticatedLimit(predictionLimiter),
  apiPredict
);
router.post(
  '/feedback',
  requireAuth,
  authenticatedLimit(predictionLimiter),
  apiFeedback
);

module.exports = router;