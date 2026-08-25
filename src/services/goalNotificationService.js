'use strict';

/**
 * Goal Notification Service — coordinates privacy-safe notification events after
 * persisted study-goal mutations and during bounded student notification reads.
 * It deliberately owns no SQL; persistence stays in the existing services.
 */
const authService = require('./authService');
const notificationService = require('./notificationService');
const studyGoalService = require('./studyGoalService');
const { parseUtcDate } = require('./studyProgressService');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDER_GOALS = 10;

function assertPositiveId(value, label) {
  const id = parsePositiveSafeInteger(value);
  if (id === null) throw new TypeError(`${label} must be a positive integer.`);
  return id;
}

function normalizeNow(now) {
  if (now === undefined) return new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('now must be a valid Date.');
  }
  return now;
}

function formatUtcDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Return the ISO date for the Monday beginning the given UTC calendar week.
 * Sunday belongs to the preceding Monday–Sunday week.
 */
function getUtcMonday(now = new Date()) {
  const date = normalizeNow(now);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return formatUtcDate(today - (daysSinceMonday * DAY_MS));
}

async function createWhenEnabled({ userId, preference, type, metadata }) {
  const preferences = await notificationService.getNotificationPreferences(userId);
  if (!preferences[preference]) {
    return { created: false, skipped: 'preference_disabled' };
  }
  return notificationService.createNotification({ userId, type, metadata });
}

/**
 * Notify the uniquely linked student account that staff changed their feedback.
 */
async function notifyTeacherFeedback({ studentId, goalId, checkInId, eventVersion }) {
  const safeStudentId = assertPositiveId(studentId, 'Student ID');
  const userId = await authService.findUniqueActiveStudentUserId(safeStudentId);
  if (userId === null) {
    return { created: false, skipped: 'recipient_unavailable' };
  }

  return createWhenEnabled({
    userId,
    preference: 'teacherFeedback',
    type: 'teacher_feedback',
    metadata: {
      goalId: assertPositiveId(goalId, 'Goal ID'),
      checkinId: assertPositiveId(checkInId, 'Check-in ID'),
      eventVersion: assertPositiveId(eventVersion, 'Event version'),
    },
  });
}

/**
 * Notify the authenticated student of their one-time goal completion.
 */
async function notifyGoalCompleted({ userId, goalId }) {
  return createWhenEnabled({
    userId: assertPositiveId(userId, 'User ID'),
    preference: 'goalReminders',
    type: 'goal_completed',
    metadata: {
      goalId: assertPositiveId(goalId, 'Goal ID'),
    },
  });
}

/**
 * Use the existing ownership-bound progress read model before creating a risk
 * notification. The calculation itself remains in studyProgressService.
 */
async function notifyProgressAttention({ userId, studentId, goalId, checkInId, eventVersion, now }) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const safeStudentId = assertPositiveId(studentId, 'Student ID');
  const safeGoalId = assertPositiveId(goalId, 'Goal ID');
  const preferences = await notificationService.getNotificationPreferences(safeUserId);
  if (!preferences.riskAlerts) {
    return { created: false, skipped: 'preference_disabled' };
  }

  const detail = await studyGoalService.getGoalWithProgressForStudent(safeStudentId, safeGoalId, {
    now: now === undefined ? undefined : normalizeNow(now),
  });
  if (!detail || detail.progress?.status !== 'needs_attention') {
    return { created: false, skipped: 'status_not_notifiable' };
  }

  return notificationService.createNotification({
    userId: safeUserId,
    type: 'progress_attention',
    metadata: {
      goalId: safeGoalId,
      checkinId: assertPositiveId(checkInId, 'Check-in ID'),
      progressStatus: 'needs_attention',
      eventVersion: assertPositiveId(eventVersion, 'Event version'),
    },
  });
}

/**
 * Synchronize a small, student-owned reminder set on demand. The controller
 * supplies both identifiers exclusively from the authenticated session.
 */
async function syncStudentGoalReminders({ userId, studentId, now } = {}) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const safeStudentId = assertPositiveId(studentId, 'Student ID');
  const current = normalizeNow(now);
  const today = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const reminderWeekStart = getUtcMonday(current);
  const preferences = await notificationService.getNotificationPreferences(safeUserId);

  if (!preferences.goalReminders && !preferences.checkinReminders) {
    return {
      processedGoals: 0,
      deadlineNotifications: 0,
      checkInNotifications: 0,
      truncated: false,
    };
  }

  const candidates = await studyGoalService.getActiveGoalReminderCandidates(safeStudentId, {
    limit: MAX_REMINDER_GOALS + 1,
  });
  const goals = candidates.slice(0, MAX_REMINDER_GOALS);
  let deadlineNotifications = 0;
  let checkInNotifications = 0;

  for (const goal of goals) {
    const goalId = assertPositiveId(goal.id, 'Goal ID');

    if (preferences.goalReminders) {
      const deadlineTimestamp = parseUtcDate(goal.deadline);
      const remainingDays = deadlineTimestamp === null
        ? null
        : Math.round((deadlineTimestamp - today) / DAY_MS);
      if (remainingDays !== null && remainingDays >= 0 && remainingDays <= 7) {
        const notification = await notificationService.createNotification({
          userId: safeUserId,
          type: 'goal_deadline',
          metadata: {
            goalId,
            deadline: formatUtcDate(deadlineTimestamp),
          },
        });
        if (notification.created) deadlineNotifications += 1;
      }
    }

    if (preferences.checkinReminders) {
      const checkIn = await studyGoalService.getCheckInByGoalAndWeek(goalId, reminderWeekStart);
      if (!checkIn) {
        const notification = await notificationService.createNotification({
          userId: safeUserId,
          type: 'checkin_reminder',
          metadata: { goalId, reminderWeekStart },
        });
        if (notification.created) checkInNotifications += 1;
      }
    }
  }

  return {
    processedGoals: goals.length,
    deadlineNotifications,
    checkInNotifications,
    truncated: candidates.length > MAX_REMINDER_GOALS,
  };
}

module.exports = {
  MAX_REMINDER_GOALS,
  getUtcMonday,
  notifyGoalCompleted,
  notifyProgressAttention,
  notifyTeacherFeedback,
  syncStudentGoalReminders,
};
