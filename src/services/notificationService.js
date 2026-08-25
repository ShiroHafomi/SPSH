'use strict';

/**
 * Notification Service — storage, privacy boundaries, and ownership-bound
 * queries for in-app notifications. Notification delivery/event generation is
 * intentionally outside this service and will be added in a later phase.
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

const MAX_NOTIFICATION_PAGE = 100000;
const MAX_NOTIFICATION_PAGE_SIZE = 100;
const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;
const MAX_METADATA_BYTES = 128;
const ALLOWED_PROGRESS_STATUSES = new Set([
  'on_track',
  'needs_attention',
  'insufficient_data',
  'completed',
  'overdue',
]);
const ALLOWED_METADATA_FIELDS = new Set([
  'goalId',
  'studentId',
  'checkinId',
  'progressStatus',
  'deadline',
  'eventVersion',
  'reminderWeekStart',
]);
const PREFERENCE_COLUMNS = Object.freeze({
  goal_reminders: 'goal_reminders',
  checkin_reminders: 'checkin_reminders',
  teacher_feedback: 'teacher_feedback',
  risk_alerts: 'risk_alerts',
});
const NOTIFICATION_TYPES = Object.freeze({
  goal_deadline: {
    titleKey: 'notifications.goalDeadline.title',
    messageKey: 'notifications.goalDeadline.message',
  },
  checkin_reminder: {
    titleKey: 'notifications.checkinReminder.title',
    messageKey: 'notifications.checkinReminder.message',
  },
  progress_attention: {
    titleKey: 'notifications.progressAttention.title',
    messageKey: 'notifications.progressAttention.message',
  },
  teacher_feedback: {
    titleKey: 'notifications.teacherFeedback.title',
    messageKey: 'notifications.teacherFeedback.message',
  },
  goal_completed: {
    titleKey: 'notifications.goalCompleted.title',
    messageKey: 'notifications.goalCompleted.message',
  },
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPositiveId(value, label) {
  const id = parsePositiveSafeInteger(value);
  if (id === null) throw new TypeError(`${label} must be a positive integer.`);
  return id;
}

function isCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeMetadataValue(key, value) {
  if (key === 'goalId' || key === 'studentId' || key === 'checkinId' || key === 'eventVersion') {
    return assertPositiveId(value, `metadata.${key}`);
  }
  if (key === 'progressStatus') {
    if (typeof value !== 'string' || !ALLOWED_PROGRESS_STATUSES.has(value)) {
      throw new TypeError('metadata.progressStatus is invalid.');
    }
    return value;
  }
  if (key === 'deadline') {
    if (!isCalendarDate(value)) {
      throw new TypeError('metadata.deadline must be a valid date.');
    }
    return value;
  }
  if (key === 'reminderWeekStart') {
    if (!isCalendarDate(value) || new Date(`${value}T00:00:00.000Z`).getUTCDay() !== 1) {
      throw new TypeError('metadata.reminderWeekStart must be a UTC Monday date.');
    }
    return value;
  }
  throw new TypeError(`metadata.${key} is not allowed.`);
}

function validateMetadata(metadata) {
  if (metadata === undefined || metadata === null) return {};
  if (!isPlainObject(metadata)) {
    throw new TypeError('metadata must be an object.');
  }

  const metadataKeys = Object.keys(metadata);
  for (const key of metadataKeys) {
    if (!ALLOWED_METADATA_FIELDS.has(key)) {
      throw new TypeError(`metadata.${key} is not allowed.`);
    }
  }

  const normalized = {};
  for (const key of ['goalId', 'studentId', 'checkinId', 'progressStatus', 'deadline', 'eventVersion', 'reminderWeekStart']) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      normalized[key] = normalizeMetadataValue(key, metadata[key]);
    }
  }

  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_METADATA_BYTES) {
    throw new RangeError(`metadata cannot exceed ${MAX_METADATA_BYTES} bytes.`);
  }
  return normalized;
}

function parseStoredMetadata(rawMetadata) {
  let parsed = rawMetadata;
  try {
    if (Buffer.isBuffer(parsed)) parsed = parsed.toString('utf8');
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  } catch {
    return {};
  }

  if (!isPlainObject(parsed)) return {};

  const safeMetadata = {};
  for (const key of ['goalId', 'studentId', 'checkinId', 'progressStatus', 'deadline', 'eventVersion', 'reminderWeekStart']) {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
    try {
      safeMetadata[key] = normalizeMetadataValue(key, parsed[key]);
    } catch {
      // Ignore a malformed or disallowed stored value rather than failing a list response.
    }
  }

  try {
    return Buffer.byteLength(JSON.stringify(safeMetadata), 'utf8') <= MAX_METADATA_BYTES
      ? safeMetadata
      : {};
  } catch {
    return {};
  }
}

function assertNotificationType(type) {
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, type)) {
    throw new TypeError('Unsupported notification type.');
  }
  return type;
}

function buildDedupeKey(type, metadata) {
  const safeType = assertNotificationType(type);
  const safeMetadata = validateMetadata(metadata);
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ type: safeType, metadata: safeMetadata }), 'utf8')
    .digest('hex');
  return `${safeType}:${hash}`;
}

function normalizeListOptions(options = {}) {
  if (!isPlainObject(options)) throw new TypeError('Notification list options must be an object.');

  const page = options.page === undefined ? 1 : parsePositiveSafeInteger(options.page);
  const size = options.size === undefined ? DEFAULT_NOTIFICATION_PAGE_SIZE : parsePositiveSafeInteger(options.size);
  if (page === null || page > MAX_NOTIFICATION_PAGE) {
    throw new RangeError(`page must be a positive integer no greater than ${MAX_NOTIFICATION_PAGE}.`);
  }
  if (size === null || size > MAX_NOTIFICATION_PAGE_SIZE) {
    throw new RangeError(`size must be a positive integer no greater than ${MAX_NOTIFICATION_PAGE_SIZE}.`);
  }

  const status = options.status === undefined ? 'all' : options.status;
  if (!['all', 'read', 'unread'].includes(status)) {
    throw new TypeError('status must be one of: all, read, unread.');
  }

  const type = options.type;
  if (type !== undefined) assertNotificationType(type);

  return { page, size, status, type };
}

function normalizeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    titleKey: row.title_key,
    messageKey: row.message_key,
    metadata: parseStoredMetadata(row.metadata_json),
    isRead: row.is_read === true || Number(row.is_read) === 1,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function normalizePreferences(row) {
  return {
    goalReminders: row.goal_reminders === true || Number(row.goal_reminders) === 1,
    checkinReminders: row.checkin_reminders === true || Number(row.checkin_reminders) === 1,
    teacherFeedback: row.teacher_feedback === true || Number(row.teacher_feedback) === 1,
    riskAlerts: row.risk_alerts === true || Number(row.risk_alerts) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePreferenceUpdates(updates) {
  if (!isPlainObject(updates)) {
    throw new TypeError('Notification preferences must be an object.');
  }

  const fields = Object.keys(updates);
  if (fields.length === 0) {
    throw new TypeError('At least one notification preference is required.');
  }

  const normalized = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(PREFERENCE_COLUMNS, field)) {
      throw new TypeError(`${field} is not a notification preference.`);
    }
    if (typeof updates[field] !== 'boolean') {
      throw new TypeError(`${field} must be a boolean.`);
    }
    normalized[field] = updates[field];
  }
  return normalized;
}

async function ensureNotificationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      type VARCHAR(50) NOT NULL,
      title_key VARCHAR(120) NOT NULL,
      message_key VARCHAR(120) NOT NULL,
      metadata_json JSON NOT NULL,
      dedupe_key VARCHAR(255) NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL,
      INDEX idx_notifications_user (user_id),
      INDEX idx_notifications_user_read (user_id, is_read),
      INDEX idx_notifications_user_created (user_id, created_at),
      UNIQUE KEY uk_notifications_user_dedupe (user_id, dedupe_key),
      CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureNotificationPreferencesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INT UNSIGNED PRIMARY KEY,
      goal_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      checkin_reminders BOOLEAN NOT NULL DEFAULT TRUE,
      teacher_feedback BOOLEAN NOT NULL DEFAULT TRUE,
      risk_alerts BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_notification_preferences_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureNotificationTables() {
  await ensureNotificationsTable();
  await ensureNotificationPreferencesTable();
}

async function createNotification({ userId, type, metadata } = {}) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const safeType = assertNotificationType(type);
  const safeMetadata = validateMetadata(metadata);
  const dedupeKey = buildDedupeKey(safeType, safeMetadata);
  const keys = NOTIFICATION_TYPES[safeType];

  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, type, title_key, message_key, metadata_json, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      safeUserId,
      safeType,
      keys.titleKey,
      keys.messageKey,
      JSON.stringify(safeMetadata),
      dedupeKey,
    ]
  );

  return {
    id: result.insertId,
    type: safeType,
    titleKey: keys.titleKey,
    messageKey: keys.messageKey,
    metadata: safeMetadata,
    dedupeKey,
    created: result.affectedRows === 1,
  };
}

async function listNotifications(userId, options) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const { page, size, status, type } = normalizeListOptions(options);
  const conditions = ['user_id = ?'];
  const values = [safeUserId];

  if (status === 'read') {
    conditions.push('is_read = ?');
    values.push(1);
  } else if (status === 'unread') {
    conditions.push('is_read = ?');
    values.push(0);
  }
  if (type !== undefined) {
    conditions.push('type = ?');
    values.push(type);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const offset = (page - 1) * size;
  const [rows] = await pool.query(
    `SELECT id, type, title_key, message_key, metadata_json, is_read, created_at, read_at
     FROM notifications ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...values, size, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notifications ${whereClause}`,
    values
  );
  const total = Number(countRows[0]?.total) || 0;

  return {
    notifications: rows.map(normalizeNotification),
    total,
    page,
    size,
    totalPages: Math.ceil(total / size),
  };
}

async function countUnreadNotifications(userId) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = ?',
    [safeUserId, 0]
  );
  return Number(rows[0]?.total) || 0;
}

async function getNotificationForUser(notificationId, userId) {
  const safeNotificationId = assertPositiveId(notificationId, 'Notification ID');
  const safeUserId = assertPositiveId(userId, 'User ID');
  const [rows] = await pool.query(
    `SELECT id, type, title_key, message_key, metadata_json, is_read, created_at, read_at
     FROM notifications WHERE id = ? AND user_id = ?`,
    [safeNotificationId, safeUserId]
  );
  return rows.length ? normalizeNotification(rows[0]) : null;
}

async function markNotificationAsRead(notificationId, userId) {
  const existing = await getNotificationForUser(notificationId, userId);
  if (!existing) return null;

  if (!existing.isRead) {
    const safeNotificationId = assertPositiveId(notificationId, 'Notification ID');
    const safeUserId = assertPositiveId(userId, 'User ID');
    await pool.query(
      `UPDATE notifications SET is_read = ?, read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND is_read = ?`,
      [1, safeNotificationId, safeUserId, 0]
    );
  }

  return getNotificationForUser(notificationId, userId);
}

async function markAllNotificationsAsRead(userId) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const [result] = await pool.query(
    `UPDATE notifications SET is_read = ?, read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND is_read = ?`,
    [1, safeUserId, 0]
  );
  return result.affectedRows;
}

async function deleteNotificationForUser(notificationId, userId) {
  const safeNotificationId = assertPositiveId(notificationId, 'Notification ID');
  const safeUserId = assertPositiveId(userId, 'User ID');
  const [result] = await pool.query(
    'DELETE FROM notifications WHERE id = ? AND user_id = ?',
    [safeNotificationId, safeUserId]
  );
  return result.affectedRows > 0;
}

async function ensurePreferenceRow(userId) {
  await pool.query(
    `INSERT INTO notification_preferences (user_id) VALUES (?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId]
  );
}

async function selectPreferences(userId) {
  const [rows] = await pool.query(
    `SELECT goal_reminders, checkin_reminders, teacher_feedback, risk_alerts, created_at, updated_at
     FROM notification_preferences WHERE user_id = ?`,
    [userId]
  );
  return rows.length ? normalizePreferences(rows[0]) : null;
}

async function getNotificationPreferences(userId) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  await ensurePreferenceRow(safeUserId);
  return selectPreferences(safeUserId);
}

async function updateNotificationPreferences(userId, updates) {
  const safeUserId = assertPositiveId(userId, 'User ID');
  const safeUpdates = normalizePreferenceUpdates(updates);
  const fields = [];
  const values = [];

  for (const [field, value] of Object.entries(safeUpdates)) {
    fields.push(`${PREFERENCE_COLUMNS[field]} = ?`);
    values.push(value ? 1 : 0);
  }

  await ensurePreferenceRow(safeUserId);
  values.push(safeUserId);
  await pool.query(
    `UPDATE notification_preferences SET ${fields.join(', ')} WHERE user_id = ?`,
    values
  );
  return selectPreferences(safeUserId);
}

module.exports = {
  ALLOWED_METADATA_FIELDS,
  ALLOWED_PROGRESS_STATUSES,
  DEFAULT_NOTIFICATION_PAGE_SIZE,
  MAX_METADATA_BYTES,
  MAX_NOTIFICATION_PAGE,
  MAX_NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_TYPES,
  PREFERENCE_COLUMNS,
  buildDedupeKey,
  countUnreadNotifications,
  createNotification,
  deleteNotificationForUser,
  ensureNotificationPreferencesTable,
  ensureNotificationsTable,
  ensureNotificationTables,
  getNotificationForUser,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  normalizeListOptions,
  normalizePreferenceUpdates,
  parseStoredMetadata,
  updateNotificationPreferences,
  validateMetadata,
};
