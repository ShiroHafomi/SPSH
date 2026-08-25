'use strict';

/**
 * Deterministic study-goal progress calculations.
 *
 * This module intentionally has no MySQL or Express dependencies so the same
 * rules are used by every caller and can be tested with plain objects.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MEANINGFUL_CHECKINS = 2;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse a calendar date without relying on the server's local timezone.
 * Date-only MySQL values are parsed as midnight UTC, while Date objects are
 * reduced to their UTC calendar date. Invalid or impossible dates return null.
 */
function parseUtcDate(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
    return null;
  }

  return timestamp;
}

function averageNumeric(checkIns, field) {
  const values = checkIns
    .map((checkIn) => finiteNumber(checkIn?.[field]))
    .filter((value) => value !== null);

  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function targetAttainment(value, target) {
  if (value === null || target === null || target < 0) return null;
  if (target === 0) return value >= 0 ? 1 : 0;
  return clamp(value / target, 0, 1);
}

/**
 * Calculate a progress summary for one goal and its check-ins in ascending
 * week_start order.
 *
 * Rules:
 * - `completed` and expired `active` goals override all evidence-based states.
 * - A goal needs two check-ins, two recorded scores, and one measurable target
 *   before it can be `on_track`; this prevents optimistic results from thin data.
 * - Progress is the equally weighted mean of available score, study-hour, and
 *   attendance target attainment. Each component is clamped before averaging.
 * - All averages ignore absent optional values. No missing value can produce
 *   NaN or Infinity in the response.
 */
function calculateProgress(goal, orderedCheckIns, { now = new Date() } = {}) {
  const checkIns = Array.isArray(orderedCheckIns) ? orderedCheckIns : [];
  const nowDate = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const todayUtc = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate()
  );
  const deadlineUtc = parseUtcDate(goal?.deadline);
  const remainingDays = deadlineUtc === null ? null : Math.round((deadlineUtc - todayUtc) / DAY_MS);

  const averageWeeklyStudyHours = averageNumeric(checkIns, 'study_hours');
  const averageSleepHours = averageNumeric(checkIns, 'sleep_hours');
  const averageAttendance = averageNumeric(checkIns, 'attendance_percent');

  const recordedScores = checkIns
    .map((checkIn) => finiteNumber(checkIn?.current_score))
    .filter((score) => score !== null);
  const firstRecordedScore = recordedScores.length ? recordedScores[0] : null;
  const latestRecordedScore = recordedScores.length
    ? recordedScores[recordedScores.length - 1]
    : null;
  const scoreChange = recordedScores.length >= 2
    ? round(latestRecordedScore - firstRecordedScore)
    : null;

  const targetScore = finiteNumber(goal?.target_score);
  const targetStudyHours = finiteNumber(goal?.target_study_hours);
  const targetAttendance = finiteNumber(goal?.target_attendance);
  const distanceFromTargetScore = targetScore !== null && latestRecordedScore !== null
    ? round(Math.abs(targetScore - latestRecordedScore))
    : null;

  const attainment = [
    targetAttainment(latestRecordedScore, targetScore),
    targetAttainment(averageWeeklyStudyHours, targetStudyHours),
    targetAttainment(averageAttendance, targetAttendance),
  ].filter((value) => value !== null);
  const progressPercentage = attainment.length
    ? round(clamp((attainment.reduce((sum, value) => sum + value, 0) / attainment.length) * 100, 0, 100))
    : 0;

  let status = 'needs_attention';
  if (goal?.status === 'completed') {
    status = 'completed';
  } else if (goal?.status === 'active' && remainingDays !== null && remainingDays < 0) {
    status = 'overdue';
  } else if (goal?.status !== 'active') {
    // Paused and cancelled goals should never be presented as actively on track.
    status = 'needs_attention';
  } else {
    const hasMeaningfulEvidence = checkIns.length >= MIN_MEANINGFUL_CHECKINS
      && recordedScores.length >= MIN_MEANINGFUL_CHECKINS
      && attainment.length > 0;
    if (!hasMeaningfulEvidence) {
      status = 'insufficient_data';
    } else if (progressPercentage >= 75 && scoreChange !== null && scoreChange >= 0) {
      status = 'on_track';
    }
  }

  return {
    remainingDays,
    totalCheckIns: checkIns.length,
    latestCheckIn: checkIns.length ? checkIns[checkIns.length - 1] : null,
    averageWeeklyStudyHours,
    averageSleepHours,
    averageAttendance,
    firstRecordedScore,
    latestRecordedScore,
    scoreChange,
    distanceFromTargetScore,
    progressPercentage,
    status,
  };
}

module.exports = {
  MIN_MEANINGFUL_CHECKINS,
  calculateProgress,
  parseUtcDate,
};
