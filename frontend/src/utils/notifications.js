import { safeInternalPath } from './safeNavigation.js';

export const NOTIFICATION_TYPES = Object.freeze({
  goal_deadline: {
    titleKey: 'notifications.goalDeadline.title',
    messageKey: 'notifications.goalDeadline.message',
    icon: 'calendar',
    tone: 'warning',
  },
  checkin_reminder: {
    titleKey: 'notifications.checkinReminder.title',
    messageKey: 'notifications.checkinReminder.message',
    icon: 'clock',
    tone: 'primary',
  },
  progress_attention: {
    titleKey: 'notifications.progressAttention.title',
    messageKey: 'notifications.progressAttention.message',
    icon: 'alertTriangle',
    tone: 'danger',
  },
  teacher_feedback: {
    titleKey: 'notifications.teacherFeedback.title',
    messageKey: 'notifications.teacherFeedback.message',
    icon: 'messageSquare',
    tone: 'success',
  },
  goal_completed: {
    titleKey: 'notifications.goalCompleted.title',
    messageKey: 'notifications.goalCompleted.message',
    icon: 'checkCircle',
    tone: 'success',
  },
});

export const NOTIFICATION_TYPE_VALUES = Object.freeze(Object.keys(NOTIFICATION_TYPES));
export const NOTIFICATION_STATUS_VALUES = Object.freeze(['all', 'unread', 'read']);
export const NOTIFICATION_PREFERENCE_FIELDS = Object.freeze({
  goalReminders: 'goal_reminders',
  checkinReminders: 'checkin_reminders',
  teacherFeedback: 'teacher_feedback',
  riskAlerts: 'risk_alerts',
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function toPositiveSafeInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;

  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function notificationDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localeFor(language) {
  return language === 'vi' ? 'vi-VN' : 'en-US';
}

export function formatNotificationDate(value, language = 'en') {
  if (!isCalendarDate(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(localeFor(language), {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatNotificationDateTime(value, language = 'en') {
  const date = notificationDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatUnreadCount(value) {
  const count = toPositiveSafeInteger(value);
  if (count === null) return '';
  return count > 99 ? '99+' : String(count);
}

export function notificationRouteForRole(role) {
  if (role === 'student') return '/student/notifications';
  if (role === 'teacher') return '/teacher/notifications';
  if (role === 'admin') return '/admin/notifications';
  return '/notifications';
}

export function getNotificationPresentation(notification) {
  const type = typeof notification?.type === 'string' ? notification.type : '';
  const presentation = NOTIFICATION_TYPES[type];
  if (!presentation) return null;

  return notification?.titleKey === presentation.titleKey
    && notification?.messageKey === presentation.messageKey
    ? { type, ...presentation }
    : null;
}

export function getSafeNotificationMetadata(notification) {
  const metadata = notification?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  const safe = {};
  for (const key of ['goalId', 'studentId', 'checkinId', 'eventVersion']) {
    const value = toPositiveSafeInteger(metadata[key]);
    if (value !== null) safe[key] = value;
  }
  if (isCalendarDate(metadata.deadline)) safe.deadline = metadata.deadline;
  if (isCalendarDate(metadata.reminderWeekStart)) safe.reminderWeekStart = metadata.reminderWeekStart;
  if (typeof metadata.progressStatus === 'string'
      && ['on_track', 'needs_attention', 'insufficient_data', 'completed', 'overdue'].includes(metadata.progressStatus)) {
    safe.progressStatus = metadata.progressStatus;
  }
  return safe;
}

export function getNotificationMessageParams(notification, language = 'en') {
  const metadata = getSafeNotificationMetadata(notification);
  return {
    deadline: metadata.deadline ? formatNotificationDate(metadata.deadline, language) : '',
    reminderWeekStart: metadata.reminderWeekStart
      ? formatNotificationDate(metadata.reminderWeekStart, language)
      : '',
  };
}

export function normalizeNotificationListOptions(options = {}) {
  const page = toPositiveSafeInteger(options.page) || 1;
  const size = toPositiveSafeInteger(options.size) || 20;
  const status = NOTIFICATION_STATUS_VALUES.includes(options.status) ? options.status : 'all';
  const type = NOTIFICATION_TYPE_VALUES.includes(options.type) ? options.type : undefined;
  return {
    page,
    size: Math.min(size, 100),
    status,
    type,
  };
}

export function buildNotificationQuery(options = {}) {
  const normalized = normalizeNotificationListOptions(options);
  const query = new URLSearchParams({
    page: String(normalized.page),
    size: String(normalized.size),
  });
  if (normalized.status !== 'all') query.set('status', normalized.status);
  if (normalized.type) query.set('type', normalized.type);
  return query.toString();
}

export function normalizeNotificationPage(result, fallback = {}) {
  const requested = normalizeNotificationListOptions(fallback);
  const total = Number.isSafeInteger(Number(result?.total)) && Number(result.total) >= 0
    ? Number(result.total)
    : 0;
  const size = toPositiveSafeInteger(result?.size) || requested.size;
  const totalPages = Number.isSafeInteger(Number(result?.totalPages)) && Number(result.totalPages) >= 0
    ? Number(result.totalPages)
    : Math.ceil(total / size);
  const page = toPositiveSafeInteger(result?.page) || requested.page;

  return {
    notifications: Array.isArray(result?.notifications) ? result.notifications : [],
    total,
    page: totalPages > 0 ? Math.min(page, totalPages) : 1,
    size,
    totalPages,
  };
}

export function buildPreferencePayload(preferences) {
  const payload = {};
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return payload;

  for (const [camelCase, snakeCase] of Object.entries(NOTIFICATION_PREFERENCE_FIELDS)) {
    if (typeof preferences[camelCase] === 'boolean') {
      payload[snakeCase] = preferences[camelCase];
    }
  }
  return payload;
}

export function resolveNotificationDestination(notification, role) {
  const fallback = '/notifications';
  const presentation = getNotificationPresentation(notification);
  if (!presentation) return fallback;

  if (role === 'student') {
    return safeInternalPath('/goals', fallback);
  }

  const studentId = getSafeNotificationMetadata(notification).studentId;
  if (studentId === undefined) return fallback;

  if (role === 'teacher') {
    return safeInternalPath(`/teacher/students/${studentId}/goals`, fallback);
  }
  if (role === 'admin') {
    return safeInternalPath(`/admin/students/${studentId}/goals`, fallback);
  }
  return fallback;
}

export function isUnreadNotification(notification) {
  return notification?.isRead !== true;
}

export function hasNotificationType(value) {
  return typeof value === 'string' && hasOwn(NOTIFICATION_TYPES, value);
}
