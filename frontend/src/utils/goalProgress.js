import { z } from 'zod';

export const GOAL_STATUSES = ['active', 'completed', 'paused', 'cancelled'];
export const GOAL_GRADES = ['A', 'B', 'C', 'D', 'F'];
export const EMPTY_VALUE = '—';

function finiteInput(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function optionalNumber(min, max, message) {
  return z.preprocess(
    finiteInput,
    z.number({ invalid_type_error: message }).min(min, message).max(max, message).nullable()
  );
}

function requiredNumber(min, max, message) {
  return z.preprocess(
    finiteInput,
    z.number({ invalid_type_error: message }).min(min, message).max(max, message)
  );
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function optionalDate(message) {
  return z.string().trim().refine((value) => value === '' || isCalendarDate(value), message);
}

export function createGoalSchema(t) {
  return z.object({
    target_score: optionalNumber(0, 100, t('goals.validation.targetScore')),
    target_grade: z.union([z.literal(''), z.enum(GOAL_GRADES)]),
    target_study_hours: optionalNumber(0, 112, t('goals.validation.targetStudyHours')),
    target_attendance: optionalNumber(0, 100, t('goals.validation.targetAttendance')),
    deadline: optionalDate(t('goals.validation.deadline')),
    status: z.enum(GOAL_STATUSES),
  });
}

export function createWeeklyCheckinSchema(t) {
  return z.object({
    week_start: z.string().trim().refine(isCalendarDate, t('checkins.validation.weekStart')),
    study_hours: requiredNumber(0, 24, t('checkins.validation.studyHours')),
    sleep_hours: requiredNumber(0, 24, t('checkins.validation.sleepHours')),
    attendance_percent: requiredNumber(0, 100, t('checkins.validation.attendance')),
    current_score: optionalNumber(0, 100, t('checkins.validation.currentScore')),
    student_note: z.string().max(1000, t('checkins.validation.studentNote')),
  });
}

export function goalPayload(values) {
  return {
    target_score: values.target_score,
    target_grade: values.target_grade || null,
    target_study_hours: values.target_study_hours,
    target_attendance: values.target_attendance,
    deadline: values.deadline || null,
    status: values.status,
  };
}

export function checkinPayload(values) {
  return {
    week_start: values.week_start,
    study_hours: values.study_hours,
    sleep_hours: values.sleep_hours,
    attendance_percent: values.attendance_percent,
    current_score: values.current_score,
    student_note: values.student_note || null,
  };
}

export function asFiniteNumber(value) {
  if (value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim())) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatMetric(value, { digits = 2, suffix = '' } = {}) {
  const number = asFiniteNumber(value);
  if (number === null) return EMPTY_VALUE;
  const rounded = Number(number.toFixed(digits));
  return `${rounded}${suffix}`;
}

export function formatGoalDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toLocaleDateString();
  }
  if (!isCalendarDate(value)) return EMPTY_VALUE;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { timeZone: 'UTC' });
}

function dateSortValue(value) {
  if (!isCalendarDate(value)) return Number.POSITIVE_INFINITY;
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function sortCheckInsChronologically(checkIns) {
  if (!Array.isArray(checkIns)) return [];
  return [...checkIns].sort((left, right) => {
    const difference = dateSortValue(left?.week_start) - dateSortValue(right?.week_start);
    if (difference !== 0) return difference;
    return (asFiniteNumber(left?.id) ?? 0) - (asFiniteNumber(right?.id) ?? 0);
  });
}

export function createTrendChartData(checkIns, field, label, color) {
  const points = sortCheckInsChronologically(checkIns)
    .map((checkIn) => ({
      label: formatGoalDate(checkIn?.week_start),
      value: asFiniteNumber(checkIn?.[field]),
    }))
    .filter((point) => point.label !== EMPTY_VALUE && point.value !== null);

  if (points.length < 2) return null;

  return {
    labels: points.map((point) => point.label),
    datasets: [{
      label,
      data: points.map((point) => point.value),
      borderColor: color.border,
      backgroundColor: color.bg,
      borderWidth: 3,
      fill: true,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: color.solid,
    }],
  };
}

export const PROGRESS_STATUS_PRESENTATION = {
  on_track: { tone: 'success', icon: 'check', labelKey: 'progress.status.onTrack' },
  needs_attention: { tone: 'danger', icon: 'alert', labelKey: 'progress.status.needsAttention' },
  insufficient_data: { tone: 'neutral', icon: 'info', labelKey: 'progress.status.insufficientData' },
  completed: { tone: 'primary', icon: 'check', labelKey: 'progress.status.completed' },
  overdue: { tone: 'warning', icon: 'clock', labelKey: 'progress.status.overdue' },
};

export function getProgressStatusPresentation(status) {
  return PROGRESS_STATUS_PRESENTATION[status] || PROGRESS_STATUS_PRESENTATION.insufficient_data;
}
