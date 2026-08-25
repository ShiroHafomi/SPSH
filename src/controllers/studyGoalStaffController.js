'use strict';

/**
 * Staff Study Goal Controller — teacher/admin read access and teacher feedback.
 * Router-level role middleware handles authorization; all resource lookups still
 * bind the requested student ID in SQL to avoid cross-student access.
 */
const studyGoalService = require('../services/studyGoalService');
const authService = require('../services/authService');
const goalNotificationService = require('../services/goalNotificationService');
const { boundedString, parsePositiveSafeInteger } = require('../utils/inputValidation');

const MAX_GOALS_PAGE_SIZE = 100;
const MAX_GOALS_PAGE = 100000;

function isRequestObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRouteId(value, label) {
  const id = parsePositiveSafeInteger(value);
  if (id === null) {
    return { error: `${label} must be a positive integer.` };
  }
  return { id };
}

function parseAdminPagination(query) {
  const pageValue = query?.page;
  const sizeValue = query?.size;
  const page = pageValue === undefined || pageValue === ''
    ? 1
    : parsePositiveSafeInteger(pageValue);
  const size = sizeValue === undefined || sizeValue === ''
    ? 20
    : parsePositiveSafeInteger(sizeValue);

  if (page === null || page > MAX_GOALS_PAGE) {
    return { error: `page must be a positive integer no greater than ${MAX_GOALS_PAGE}.` };
  }
  if (size === null || size > MAX_GOALS_PAGE_SIZE) {
    return { error: `size must be a positive integer no greater than ${MAX_GOALS_PAGE_SIZE}.` };
  }
  return { page, size };
}

function writeAuditEvent(req, { action, resourceType, resourceId, metadata }) {
  return authService.logAuditEvent({
    userId: req.user.id,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: req.ip || req.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: req.headers?.['user-agent'],
  });
}

async function runNotificationEffect(label, identifiers, work) {
  const [result] = await Promise.allSettled([Promise.resolve().then(work)]);
  if (result.status === 'rejected') {
    console.error('[studyGoalStaffNotification]', { label, ...identifiers });
  }
}

/**
 * GET /api/teacher/students/:studentId/goals
 */
async function apiTeacherListStudentGoals(req, res) {
  const parsedStudentId = parseRouteId(req.params.studentId, 'Student ID');
  if (parsedStudentId.error) return res.status(400).json({ error: parsedStudentId.error });

  try {
    const goals = await studyGoalService.getGoalsWithProgressByStudent(parsedStudentId.id);
    return res.json({ goals });
  } catch (err) {
    console.error('[apiTeacherListStudentGoals]', err);
    return res.status(500).json({ error: 'Failed to load student goals.' });
  }
}

/**
 * GET /api/teacher/students/:studentId/goals/:goalId
 */
async function apiTeacherGetStudentGoal(req, res) {
  const parsedStudentId = parseRouteId(req.params.studentId, 'Student ID');
  const parsedGoalId = parseRouteId(req.params.goalId, 'Goal ID');
  if (parsedStudentId.error || parsedGoalId.error) {
    return res.status(400).json({ error: parsedStudentId.error || parsedGoalId.error });
  }

  try {
    const detail = await studyGoalService.getGoalWithProgressForStudent(
      parsedStudentId.id,
      parsedGoalId.id
    );
    if (!detail) {
      // This intentionally does not disclose whether the student or goal exists.
      return res.status(404).json({ error: 'Goal not found.' });
    }
    return res.json(detail);
  } catch (err) {
    console.error('[apiTeacherGetStudentGoal]', err);
    return res.status(500).json({ error: 'Failed to load student goal.' });
  }
}

/**
 * PUT /api/teacher/students/:studentId/goals/:goalId/feedback
 *
 * The target check-in is identified by request-body `checkin_id`; only its
 * teacher_feedback column is writable through this endpoint.
 */
async function apiTeacherUpdateGoalFeedback(req, res) {
  const parsedStudentId = parseRouteId(req.params.studentId, 'Student ID');
  const parsedGoalId = parseRouteId(req.params.goalId, 'Goal ID');
  if (parsedStudentId.error || parsedGoalId.error) {
    return res.status(400).json({ error: parsedStudentId.error || parsedGoalId.error });
  }
  if (!isRequestObject(req.body)) {
    return res.status(400).json({ error: 'Request body must be an object.' });
  }

  const checkInId = parsePositiveSafeInteger(req.body.checkin_id);
  if (checkInId === null) {
    return res.status(400).json({ error: 'checkin_id must be a positive integer.' });
  }

  let teacherFeedback;
  try {
    teacherFeedback = boundedString(req.body.teacher_feedback, {
      field: 'teacher_feedback',
      max: 1000,
      allowEmpty: false,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const checkIn = await studyGoalService.getCheckInByIdForGoalAndStudent(
      checkInId,
      parsedGoalId.id,
      parsedStudentId.id
    );
    if (!checkIn) {
      // Avoid revealing mismatched student/goal/check-in relationships.
      return res.status(404).json({ error: 'Goal check-in not found.' });
    }

    if (checkIn.teacher_feedback === teacherFeedback) {
      return res.json({
        checkIn,
        changed: false,
      });
    }

    const outcome = await studyGoalService.updateTeacherFeedbackWithOutcome(
      checkInId,
      parsedGoalId.id,
      parsedStudentId.id,
      teacherFeedback
    );
    if (!outcome.checkIn) {
      return res.status(404).json({ error: 'Goal check-in not found.' });
    }
    if (!outcome.changed) {
      return res.json({ checkIn: outcome.checkIn, changed: false });
    }

    await writeAuditEvent(req, {
      action: 'UPDATE_CHECKIN_FEEDBACK',
      resourceType: 'weekly_checkin',
      resourceId: checkInId,
      metadata: {
        studentId: parsedStudentId.id,
        goalId: parsedGoalId.id,
        feedbackChanged: true,
      },
    });

    await runNotificationEffect(
      'teacher_feedback',
      { studentId: parsedStudentId.id, goalId: parsedGoalId.id, checkInId },
      () => goalNotificationService.notifyTeacherFeedback({
        studentId: parsedStudentId.id,
        goalId: parsedGoalId.id,
        checkInId,
        eventVersion: outcome.checkIn.notification_revision || 1,
      })
    );

    return res.json({
      checkIn: outcome.checkIn,
      changed: true,
    });
  } catch (err) {
    console.error('[apiTeacherUpdateGoalFeedback]', err);
    return res.status(500).json({ error: 'Failed to update teacher feedback.' });
  }
}

/**
 * GET /api/admin/students/:studentId/goals
 */
async function apiAdminListStudentGoals(req, res) {
  const parsedStudentId = parseRouteId(req.params.studentId, 'Student ID');
  if (parsedStudentId.error) return res.status(400).json({ error: parsedStudentId.error });

  const pagination = parseAdminPagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  try {
    const [goals, total] = await Promise.all([
      studyGoalService.getGoalsWithProgressByStudent(parsedStudentId.id, pagination),
      studyGoalService.countGoalsByStudent(parsedStudentId.id),
    ]);

    return res.json({
      goals,
      total,
      page: pagination.page,
      size: pagination.size,
      totalPages: Math.ceil(total / pagination.size),
    });
  } catch (err) {
    console.error('[apiAdminListStudentGoals]', err);
    return res.status(500).json({ error: 'Failed to load student goals.' });
  }
}

module.exports = {
  MAX_GOALS_PAGE,
  MAX_GOALS_PAGE_SIZE,
  apiAdminListStudentGoals,
  apiTeacherGetStudentGoal,
  apiTeacherListStudentGoals,
  apiTeacherUpdateGoalFeedback,
};
