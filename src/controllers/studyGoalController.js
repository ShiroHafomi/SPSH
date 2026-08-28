/**
 * Study Goal Controller — Handles study goals and weekly check-ins.
 * All endpoints require student authentication and proper authorization.
 */
const studyGoalService = require('../services/studyGoalService');
const goalNotificationService = require('../services/goalNotificationService');
const { logAuditEvent } = require('../services/authService');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

async function runNotificationEffect(label, identifiers, work) {
  const [result] = await Promise.allSettled([Promise.resolve().then(work)]);
  if (result.status === 'rejected') {
    console.error('[studyGoalNotification]', { label, ...identifiers });
  }
}

function isDuplicateCheckInError(err) {
  return err?.code === 'ER_DUP_ENTRY';
}

/**
 * GET /api/student/me/goals
 * List all goals for the authenticated student.
 */
async function apiListGoals(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const goals = await studyGoalService.getGoalsByStudent(studentId);

    res.json({ goals });
  } catch (err) {
    console.error('[apiListGoals]', err);
    res.status(500).json({ error: 'Failed to load goals.' });
  }
}

/**
 * GET /api/student/me/goals/progress
 * List goal histories and the server-calculated progress summaries for the
 * authenticated student. The original raw list endpoint remains unchanged.
 */
async function apiListGoalsWithProgress(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const goals = await studyGoalService.getGoalsWithProgressByStudent(studentId);
    return res.json({ goals });
  } catch (err) {
    console.error('[apiListGoalsWithProgress]', err);
    return res.status(500).json({ error: 'Failed to load goal progress.' });
  }
}

/**
 * POST /api/student/me/goals
 * Create a new goal for the authenticated student.
 */
async function apiCreateGoal(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const { target_score, target_grade, target_study_hours, target_attendance, deadline, status } = req.body || {};
    const goalStatus = status === undefined ? 'active' : status;

    // Validate input
    const validationErrors = studyGoalService.validateGoalData({
      targetScore: target_score,
      targetGrade: target_grade,
      targetStudyHours: target_study_hours,
      targetAttendance: target_attendance,
      deadline,
      status: goalStatus,
    });

    if (validationErrors.length) {
      return res.status(400).json({ error: validationErrors[0], errors: validationErrors });
    }

    // Create the goal through a transaction that serializes active-goal checks
    // for this student, preventing concurrent create requests from bypassing it.
    const goal = await studyGoalService.createGoalForStudent({
      studentId,
      targetScore: target_score,
      targetGrade: target_grade,
      targetStudyHours: target_study_hours,
      targetAttendance: target_attendance,
      deadline,
      status: goalStatus,
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE_GOAL',
      resourceType: 'study_goal',
      resourceId: goal.id,
      metadata: { studentId, status: goal.status },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ goal });
  } catch (err) {
    if (err?.code === 'ACTIVE_GOAL_EXISTS') {
      return res.status(400).json({
        error: 'Cannot create a new active goal. You already have an active goal.',
        code: 'ACTIVE_GOAL_EXISTS',
      });
    }
    console.error('[apiCreateGoal]', err);
    return res.status(500).json({ error: 'Failed to create goal.' });
  }
}

/**
 * GET /api/student/me/goals/:goalId
 * Get a specific goal by ID.
 */
async function apiGetGoal(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);

    if (!goalId) {
      return res.status(400).json({ error: 'Invalid goal ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const goal = await studyGoalService.getGoalByIdForStudent(goalId, studentId);

    if (!goal) {
      // Do not reveal whether another student's goal exists.
      return res.status(404).json({ error: 'Goal not found.' });
    }

    return res.json({ goal });
  } catch (err) {
    console.error('[apiGetGoal]', err);
    res.status(500).json({ error: 'Failed to get goal.' });
  }
}

/**
 * PUT /api/student/me/goals/:goalId
 * Update a specific goal.
 */
async function apiUpdateGoal(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);

    if (!goalId) {
      return res.status(400).json({ error: 'Invalid goal ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const existingGoal = await studyGoalService.getGoalByIdForStudent(goalId, studentId);

    if (!existingGoal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    const { target_score, target_grade, target_study_hours, target_attendance, deadline, status } = req.body || {};

    // Preserve the existing lifecycle status for deadline validation when this
    // update does not include a status change.
    const validationErrors = studyGoalService.validateGoalData({
      targetScore: target_score,
      targetGrade: target_grade,
      targetStudyHours: target_study_hours,
      targetAttendance: target_attendance,
      deadline,
      status: status === undefined ? existingGoal.status : status,
    });

    if (validationErrors.length) {
      return res.status(400).json({ error: validationErrors[0], errors: validationErrors });
    }

    // Update the goal
    const updates = {};
    if (target_score !== undefined) updates.targetScore = target_score;
    if (target_grade !== undefined) updates.targetGrade = target_grade;
    if (target_study_hours !== undefined) updates.targetStudyHours = target_study_hours;
    if (target_attendance !== undefined) updates.targetAttendance = target_attendance;
    if (deadline !== undefined) updates.deadline = deadline;
    if (status !== undefined) updates.status = status;

    const result = await studyGoalService.updateGoalForStudent(studentId, goalId, updates);

    if (!result.found) {
      return res.status(404).json({ error: 'Goal not found.' });
    }
    if (!result.updated) {
      return res.status(400).json({ error: 'No changes made.' });
    }

    const updatedGoal = await studyGoalService.getGoalByIdForStudent(goalId, studentId);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_GOAL',
      resourceType: 'study_goal',
      resourceId: goalId,
      metadata: { studentId, updatedFields: Object.keys(updates) },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    if (existingGoal.status !== 'completed'
        && status === 'completed'
        && updatedGoal?.status === 'completed') {
      await runNotificationEffect(
        'goal_completed',
        { userId: req.user.id, studentId, goalId },
        () => goalNotificationService.notifyGoalCompleted({ userId: req.user.id, goalId })
      );
    }

    res.json({ goal: updatedGoal });
  } catch (err) {
    if (err?.code === 'ACTIVE_GOAL_EXISTS') {
      return res.status(400).json({
        error: 'Cannot activate this goal while another active goal exists.',
        code: 'ACTIVE_GOAL_EXISTS',
      });
    }
    console.error('[apiUpdateGoal]', err);
    return res.status(500).json({ error: 'Failed to update goal.' });
  }
}

/**
 * DELETE /api/student/me/goals/:goalId
 * Delete a specific goal.
 */
async function apiDeleteGoal(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);

    if (!goalId) {
      return res.status(400).json({ error: 'Invalid goal ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const existingGoal = await studyGoalService.getGoalByIdForStudent(goalId, studentId);

    if (!existingGoal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    await studyGoalService.deleteGoal(goalId);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'DELETE_GOAL',
      resourceType: 'study_goal',
      resourceId: goalId,
      metadata: { studentId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Goal deleted successfully.', goalId });
  } catch (err) {
    console.error('[apiDeleteGoal]', err);
    res.status(500).json({ error: 'Failed to delete goal.' });
  }
}

/**
 * GET /api/student/me/goals/:goalId/checkins
 * Get all check-ins for a goal.
 */
async function apiListCheckIns(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);

    if (!goalId) {
      return res.status(400).json({ error: 'Invalid goal ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const goal = await studyGoalService.getGoalByIdForStudent(goalId, studentId);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    const checkIns = await studyGoalService.getCheckInsByGoal(goalId);

    res.json({ checkIns });
  } catch (err) {
    console.error('[apiListCheckIns]', err);
    res.status(500).json({ error: 'Failed to load check-ins.' });
  }
}

/**
 * POST /api/student/me/goals/:goalId/checkins
 * Create a new check-in for a goal.
 */
async function apiCreateCheckIn(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);

    if (!goalId) {
      return res.status(400).json({ error: 'Invalid goal ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'teacher_feedback')) {
      return res.status(400).json({ error: 'teacher_feedback can only be updated by a teacher.' });
    }

    const goal = await studyGoalService.getGoalByIdForStudent(goalId, studentId);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    const { study_hours, sleep_hours, attendance_percent, current_score, student_note, week_start } = req.body || {};

    // Validate input
    const validationErrors = studyGoalService.validateCheckInData({
      studyHours: study_hours,
      sleepHours: sleep_hours,
      attendancePercent: attendance_percent,
      currentScore: current_score,
      studentNote: student_note,
      weekStart: week_start,
    });

    if (validationErrors.length) {
      return res.status(400).json({ error: validationErrors[0], errors: validationErrors });
    }

    // Check for duplicate check-in for the same goal and week
    const existingCheckIn = await studyGoalService.getCheckInByGoalAndWeek(goalId, week_start);
    if (existingCheckIn) {
      return res.status(400).json({
        error: 'Check-in for this week already exists for this goal.',
        code: 'CHECKIN_EXISTS',
      });
    }

    // Create the check-in
    const checkIn = await studyGoalService.createCheckIn({
      goalId,
      studyHours: study_hours,
      sleepHours: sleep_hours,
      attendancePercent: attendance_percent,
      currentScore: current_score,
      studentNote: student_note,
      teacherFeedback: null,
      weekStart: week_start,
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE_CHECKIN',
      resourceType: 'weekly_checkin',
      resourceId: checkIn.id,
      metadata: { studentId, goalId, weekStart: checkIn.week_start },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    await runNotificationEffect(
      'progress_attention',
      { userId: req.user.id, studentId, goalId, checkInId: checkIn.id },
      () => goalNotificationService.notifyProgressAttention({
        userId: req.user.id,
        studentId,
        goalId,
        checkInId: checkIn.id,
        eventVersion: checkIn.notification_revision || 1,
      })
    );

    res.status(201).json({ checkIn });
  } catch (err) {
    if (isDuplicateCheckInError(err)) {
      return res.status(400).json({
        error: 'Check-in for this week already exists for this goal.',
        code: 'CHECKIN_EXISTS',
      });
    }
    console.error('[apiCreateCheckIn]', err);
    return res.status(500).json({ error: 'Failed to create check-in.' });
  }
}

/**
 * PUT /api/student/me/goals/:goalId/checkins/:checkinId
 * Update a check-in.
 */
async function apiUpdateCheckIn(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);
    const checkInId = parsePositiveSafeInteger(req.params.checkinId);

    if (!goalId || !checkInId) {
      return res.status(400).json({ error: 'Invalid ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'teacher_feedback')) {
      return res.status(400).json({ error: 'teacher_feedback can only be updated by a teacher.' });
    }

    const existingCheckIn = await studyGoalService.getCheckInByIdForGoalAndStudent(
      checkInId,
      goalId,
      studentId
    );

    if (!existingCheckIn) {
      // Do not disclose other students' goal or check-in relationships.
      return res.status(404).json({ error: 'Check-in not found.' });
    }

    const { study_hours, sleep_hours, attendance_percent, current_score, student_note, week_start } = req.body || {};

    // Validate input (only validate fields that are being updated)
    const updates = {};
    const validationErrors = [];

    if (study_hours !== undefined) {
      const hours = Number(study_hours);
      if (isNaN(hours) || hours < 0 || hours > 24) {
        validationErrors.push('study_hours must be between 0 and 24.');
      } else {
        updates.studyHours = hours;
      }
    }

    if (sleep_hours !== undefined) {
      const hours = Number(sleep_hours);
      if (isNaN(hours) || hours < 0 || hours > 24) {
        validationErrors.push('sleep_hours must be between 0 and 24.');
      } else {
        updates.sleepHours = hours;
      }
    }

    if (attendance_percent !== undefined) {
      const attendance = Number(attendance_percent);
      if (isNaN(attendance) || attendance < 0 || attendance > 100) {
        validationErrors.push('attendance_percent must be between 0 and 100.');
      } else {
        updates.attendancePercent = attendance;
      }
    }

    if (current_score !== undefined) {
      if (current_score === null) {
        updates.currentScore = null;
      } else {
        const score = Number(current_score);
        if (isNaN(score) || score < 0 || score > 100) {
          validationErrors.push('current_score must be between 0 and 100.');
        } else {
          updates.currentScore = score;
        }
      }
    }

    if (student_note !== undefined) {
      if (typeof student_note !== 'string' || student_note.length > 1000) {
        validationErrors.push('student_note cannot exceed 1000 characters.');
      } else {
        updates.studentNote = student_note;
      }
    }

    if (week_start !== undefined) {
      if (!studyGoalService.isCalendarDate(week_start)) {
        validationErrors.push('week_start must be a valid date.');
      } else {
        updates.weekStart = week_start;
      }
    }

    if (validationErrors.length) {
      return res.status(400).json({ error: validationErrors[0], errors: validationErrors });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    if (updates.weekStart !== undefined && updates.weekStart !== existingCheckIn.week_start) {
      const duplicate = await studyGoalService.getCheckInByGoalAndWeek(goalId, updates.weekStart);
      if (duplicate && duplicate.id !== checkInId) {
        return res.status(400).json({
          error: 'Check-in for this week already exists for this goal.',
          code: 'CHECKIN_EXISTS',
        });
      }
    }

    const success = await studyGoalService.updateCheckIn(checkInId, updates);

    if (!success) {
      return res.status(404).json({ error: 'Check-in not found or no changes made.' });
    }

    const updatedCheckIn = await studyGoalService.getCheckInById(checkInId);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_CHECKIN',
      resourceType: 'weekly_checkin',
      resourceId: checkInId,
      metadata: { studentId, goalId, updatedFields: Object.keys(updates) },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    await runNotificationEffect(
      'progress_attention',
      { userId: req.user.id, studentId, goalId, checkInId },
      () => goalNotificationService.notifyProgressAttention({
        userId: req.user.id,
        studentId,
        goalId,
        checkInId,
        eventVersion: updatedCheckIn?.notification_revision || 1,
      })
    );

    res.json({ checkIn: updatedCheckIn });
  } catch (err) {
    if (isDuplicateCheckInError(err)) {
      return res.status(400).json({
        error: 'Check-in for this week already exists for this goal.',
        code: 'CHECKIN_EXISTS',
      });
    }
    console.error('[apiUpdateCheckIn]', err);
    return res.status(500).json({ error: 'Failed to update check-in.' });
  }
}

/**
 * DELETE /api/student/me/goals/:goalId/checkins/:checkinId
 * Delete a check-in.
 */
async function apiDeleteCheckIn(req, res) {
  try {
    const goalId = parsePositiveSafeInteger(req.params.goalId);
    const checkInId = parsePositiveSafeInteger(req.params.checkinId);

    if (!goalId || !checkInId) {
      return res.status(400).json({ error: 'Invalid ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const existingCheckIn = await studyGoalService.getCheckInByIdForGoalAndStudent(
      checkInId,
      goalId,
      studentId
    );

    if (!existingCheckIn) {
      // Do not disclose other students' goal or check-in relationships.
      return res.status(404).json({ error: 'Check-in not found.' });
    }

    await studyGoalService.deleteCheckIn(checkInId);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'DELETE_CHECKIN',
      resourceType: 'weekly_checkin',
      resourceId: checkInId,
      metadata: { studentId, goalId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Check-in deleted successfully.', checkInId });
  } catch (err) {
    console.error('[apiDeleteCheckIn]', err);
    res.status(500).json({ error: 'Failed to delete check-in.' });
  }
}

/**
 * POST /api/student/me/goals/from-scenario/:scenarioId
 * Create a study goal from a saved What-If scenario.
 */
async function apiCreateGoalFromScenario(req, res) {
  try {
    const scenarioId = parsePositiveSafeInteger(req.params.scenarioId);

    if (!scenarioId) {
      return res.status(400).json({ error: 'Invalid scenario ID.' });
    }

    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    // Create the goal from the scenario
    const goal = await studyGoalService.createGoalFromScenario({
      studentId,
      scenarioId
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE_GOAL_FROM_SCENARIO',
      resourceType: 'study_goal',
      resourceId: goal.id,
      metadata: { studentId, scenarioId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ goal });
  } catch (err) {
    if (err?.code === 'ACTIVE_GOAL_EXISTS') {
      return res.status(400).json({
        error: 'Cannot create a new active goal. You already have an active goal.',
        code: 'ACTIVE_GOAL_EXISTS',
      });
    }
    console.error('[apiCreateGoalFromScenario]', err);
    return res.status(500).json({ error: 'Failed to create goal from scenario.' });
  }
}

module.exports = {
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
};
