/**
 * API Routes — all JSON endpoints for the SPA frontend.
 * Mounted at /api in app.js.
 */
const express = require('express');
const { requireAuth, requireRole, sessionAuth, optionalAuth } = require('../middleware/auth');
const {
  adminAiLimiter,
  adminBulkAiLimiter,
  assignmentMutationLimiter,
  authenticatedRateLimitKey,
  loginLimiter,
  notificationMutationLimiter,
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
  apiBaselinePrediction,
  apiSimulationPrediction,
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

// Study Sessions
const {
  apiListStudySessions,
  apiGetStudySessionSummary,
  apiCreateStudySession,
  apiUpdateStudySession,
  apiUpdateStudySessionStatus,
  apiDeleteStudySession,
} = require('../controllers/studySessionController');

// Personal Assignments
const {
  apiCreateAssignment,
  apiDeleteAssignment,
  apiGetAssignment,
  apiListAssignments,
  apiUpdateAssignment,
} = require('../controllers/assignmentController');

// Study Goals
const {
  apiListGoals,
  apiListGoalsWithProgress,
  apiCreateGoal,
  apiGetGoal,
  apiUpdateGoal,
  apiDeleteGoal,
  apiListCheckIns,
  apiCreateCheckIn,
  apiUpdateCheckIn,
  apiDeleteCheckIn,
  apiCreateGoalFromScenario,
} = require('../controllers/studyGoalController');
const {
  apiAdminListStudentGoals,
  apiTeacherGetStudentGoal,
  apiTeacherListStudentGoals,
  apiTeacherUpdateGoalFeedback,
} = require('../controllers/studyGoalStaffController');

// ML Monitoring
const {
  apiGetMlDrift,
  apiListMlPredictions,
} = require('../controllers/mlMonitoringController');

// Notifications
const {
  apiDeleteNotification,
  apiGetNotificationPreferences,
  apiListNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  apiUnreadNotificationCount,
  apiUpdateNotificationPreferences,
} = require('../controllers/notificationController');

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

// ─── Notifications (authenticated users, own resources only) ─────────────────
router.get('/notifications', requireAuth, apiListNotifications);
router.get('/notifications/unread-count', requireAuth, apiUnreadNotificationCount);
router.put(
  '/notifications/read-all',
  requireAuth,
  authenticatedLimit(notificationMutationLimiter),
  apiMarkAllNotificationsRead
);
router.get('/notifications/preferences', requireAuth, apiGetNotificationPreferences);
router.put(
  '/notifications/preferences',
  requireAuth,
  authenticatedLimit(notificationMutationLimiter),
  apiUpdateNotificationPreferences
);
router.put(
  '/notifications/:notificationId/read',
  requireAuth,
  authenticatedLimit(notificationMutationLimiter),
  apiMarkNotificationRead
);
router.delete(
  '/notifications/:notificationId',
  requireAuth,
  authenticatedLimit(notificationMutationLimiter),
  apiDeleteNotification
);

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

// Analytics and ML monitoring
adminRouter.get('/analytics', apiAdminAnalytics);
adminRouter.get('/ml-health', apiAdminMlHealth);
adminRouter.get('/ml/predictions', apiListMlPredictions);
adminRouter.get('/ml/drift', apiGetMlDrift);

// Audit logs
adminRouter.get('/audit-logs', apiGetAuditLogs);

// At-Risk Students
adminRouter.get('/at-risk', apiAdminAtRisk);

// Student management (filtered, with search/sort/pagination)
adminRouter.get('/students', apiAdminListStudents);
adminRouter.get('/students/:studentId/goals', apiAdminListStudentGoals);
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

// Analytics and organization-wide ML monitoring
teacherRouter.get('/analytics', apiTeacherAnalytics);
teacherRouter.get('/ml/predictions', apiListMlPredictions);
teacherRouter.get('/ml/drift', apiGetMlDrift);

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
teacherRouter.get('/students/:studentId/goals', apiTeacherListStudentGoals);
teacherRouter.get('/students/:studentId/goals/:goalId', apiTeacherGetStudentGoal);
teacherRouter.put('/students/:studentId/goals/:goalId/feedback', apiTeacherUpdateGoalFeedback);
teacherRouter.get('/students/:id', apiGetTeacherStudent);
teacherRouter.put('/students/:id', apiUpdateTeacherStudent);

router.use('/teacher', teacherRouter);

// ─── Student (requires student) ───────────────────────────────────────────────
const studentRouter = express.Router();
studentRouter.use(requireAuth, requireRole('student'));

// Profile
studentRouter.get('/me/profile', apiStudentProfile);
studentRouter.put('/me/profile', apiStudentUpdateProfile);

// Personal Assignments
studentRouter.get('/me/assignments', apiListAssignments);
studentRouter.post(
  '/me/assignments',
  authenticatedLimit(assignmentMutationLimiter),
  apiCreateAssignment
);
studentRouter.get('/me/assignments/:assignmentId', apiGetAssignment);
studentRouter.patch(
  '/me/assignments/:assignmentId',
  authenticatedLimit(assignmentMutationLimiter),
  apiUpdateAssignment
);
studentRouter.delete(
  '/me/assignments/:assignmentId',
  authenticatedLimit(assignmentMutationLimiter),
  apiDeleteAssignment
);

// Study Sessions
studentRouter.get('/me/study-sessions', apiListStudySessions);
studentRouter.get('/me/study-sessions/summary', apiGetStudySessionSummary);
studentRouter.post('/me/study-sessions', authenticatedLimit(studentAiLimiter), apiCreateStudySession);
studentRouter.patch('/me/study-sessions/:id', apiUpdateStudySession);
studentRouter.patch('/me/study-sessions/:id/status', apiUpdateStudySessionStatus);
studentRouter.delete('/me/study-sessions/:id', apiDeleteStudySession);

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

// Study Goals
studentRouter.get('/me/goals', apiListGoals);
studentRouter.get('/me/goals/progress', apiListGoalsWithProgress);
studentRouter.post('/me/goals', apiCreateGoal);
studentRouter.get('/me/goals/:goalId', apiGetGoal);
studentRouter.put('/me/goals/:goalId', apiUpdateGoal);
studentRouter.delete('/me/goals/:goalId', apiDeleteGoal);
studentRouter.post(
  '/me/goals/from-scenario/:scenarioId',
  authenticatedLimit(studentAiLimiter),
  apiCreateGoalFromScenario
);

// Weekly Check-ins
studentRouter.get('/me/goals/:goalId/checkins', apiListCheckIns);
studentRouter.post('/me/goals/:goalId/checkins', apiCreateCheckIn);
studentRouter.put('/me/goals/:goalId/checkins/:checkinId', apiUpdateCheckIn);
studentRouter.delete('/me/goals/:goalId/checkins/:checkinId', apiDeleteCheckIn);

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
router.post(
  '/predict/baseline',
  requireAuth,
  authenticatedLimit(predictionLimiter),
  apiBaselinePrediction
);
router.post(
  '/predict/simulation',
  requireAuth,
  authenticatedLimit(predictionLimiter),
  apiSimulationPrediction
);

module.exports = router;