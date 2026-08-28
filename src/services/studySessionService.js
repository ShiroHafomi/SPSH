/**
 * Study Session Service — ALL SQL for study sessions.
 * Parameterized queries only. No raw SQL in controllers/routes.
 *
 * Scheduling instants are stored in UTC. Clients submit starts_at/ends_at as
 * ISO-8601 instants carrying an explicit offset (or a `Z` suffix); the service
 * normalizes them to MySQL DATETIME (`YYYY-MM-DD HH:MM:SS`) in UTC on write and
 * converts query-window bounds the same way. Timezone-less client input is
 * rejected rather than interpreted as server-local time.
 */
const { pool } = require('../config/db');

const VALID_STATUSES = ['planned', 'completed', 'skipped'];
const MIN_PLANNED_MINUTES = 5;
const MAX_PLANNED_MINUTES = 480;
const MIN_ACTUAL_MINUTES = 1;
const MAX_ACTUAL_MINUTES = 720;

/**
 * Parse a datetime *string* into a UTC instant.
 *
 * Accepts ISO-8601 strings carrying an explicit zone (`Z` or a numeric offset)
 * and the MySQL `YYYY-MM-DD HH:MM:SS[.ffffff]` form, which is interpreted as
 * UTC (never as server-local time). Rejects zone-less dates and any value with
 * control characters or an unparseable instant.
 *
 * @param {*} value
 * @returns {Date|null}
 */
function parseUtcInstant(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;

  // Reject control characters and newlines.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(s)) return null;

  const hasExplicitZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);

  if (!hasExplicitZone) {
    // MySQL-style naive UTC datetime (internal read-back form only).
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(s)) {
      s = `${s.replace(' ', 'T')}Z`;
    } else {
      return null;
    }
  }

  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Coerce a value (Date instance, ISO string, or MySQL string) to a Date or null.
 * Used when dealing with read-back rows that may already be Date objects.
 */
function toInstant(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return parseUtcInstant(value);
}

/**
 * Convert a Date to the MySQL DATETIME string in UTC.
 */
function toMysqlUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Convert a Date to a full ISO-8601 UTC string for API responses.
 */
function toIsoUtc(date) {
  return date.toISOString();
}

/**
 * Auto-create the study_sessions table on app boot.
 */
async function ensureStudySessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id INT UNSIGNED NOT NULL,
      title VARCHAR(120) NOT NULL,
      subject VARCHAR(80) NULL,
      starts_at DATETIME(6) NOT NULL,
      ends_at DATETIME(6) NOT NULL,
      timezone VARCHAR(50) NOT NULL,
      status ENUM('planned', 'completed', 'skipped') NOT NULL DEFAULT 'planned',
      actual_minutes INT UNSIGNED NULL,
      completed_at DATETIME(6) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_student_id (student_id),
      INDEX idx_status (status),
      INDEX idx_starts_at (starts_at),
      INDEX idx_ends_at (ends_at),
      INDEX idx_student_status (student_id, status),
      INDEX idx_student_starts_at (student_id, starts_at),
      CONSTRAINT fk_study_sessions_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Validate study session data. Accepts client input (ISO strings) and read-back
 * rows (Date objects / MySQL strings) merged during updates.
 * @param {Object} data
 * @returns {Array<string>} Errors array (empty when valid).
 */
function validateStudySessionData(data) {
  const errors = [];

  if (typeof data.title !== 'string') {
    errors.push('title is required and must be a string');
  } else {
    const trimmed = data.title.trim();
    if (!trimmed) {
      errors.push('title cannot be empty or only whitespace');
    } else if (trimmed.length > 120) {
      errors.push('title must be 120 characters or less');
    }
  }

  if (data.subject !== undefined && data.subject !== null) {
    if (typeof data.subject !== 'string') {
      errors.push('subject must be a string');
    } else if (data.subject.trim().length > 80) {
      errors.push('subject must be 80 characters or less');
    }
  }

  if (!data.timezone || typeof data.timezone !== 'string') {
    errors.push('timezone is required and must be a string');
  } else if (data.timezone.length > 50 || !/^(?!Invalid\/)[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z0-9+_-]+)*$/.test(data.timezone)) {
    errors.push('timezone must be a valid IANA timezone identifier');
  }

  const starts = toInstant(data.starts_at);
  const ends = toInstant(data.ends_at);

  if (!data.starts_at) {
    errors.push('starts_at is required');
  } else if (!starts) {
    errors.push('starts_at must be a valid datetime with an explicit UTC offset');
  }

  if (!data.ends_at) {
    errors.push('ends_at is required');
  } else if (!ends) {
    errors.push('ends_at must be a valid datetime with an explicit UTC offset');
  }

  if (starts && ends) {
    const durationMinutes = (ends.getTime() - starts.getTime()) / 60000;
    if (durationMinutes <= 0) {
      errors.push('ends_at must be after starts_at');
    } else if (durationMinutes < MIN_PLANNED_MINUTES || durationMinutes > MAX_PLANNED_MINUTES) {
      errors.push(`planned duration must be between ${MIN_PLANNED_MINUTES} and ${MAX_PLANNED_MINUTES} minutes`);
    }
  }

  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push('status must be one of: planned, completed, skipped');
  }

  if (data.status === 'completed') {
    if (data.actual_minutes === undefined || data.actual_minutes === null || data.actual_minutes === '') {
      errors.push('actual_minutes is required for completed sessions');
    } else {
      const minutes = Number(data.actual_minutes);
      if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < MIN_ACTUAL_MINUTES || minutes > MAX_ACTUAL_MINUTES) {
        errors.push(`actual_minutes must be an integer between ${MIN_ACTUAL_MINUTES} and ${MAX_ACTUAL_MINUTES}`);
      }
    }
  } else if (data.actual_minutes !== undefined && data.actual_minutes !== null) {
    errors.push('actual_minutes must be empty for non-completed sessions');
  }

  if (data.status === 'completed') {
    if (data.completed_at !== undefined && data.completed_at !== null && !toInstant(data.completed_at)) {
      errors.push('completed_at must be a valid datetime');
    }
  } else if (data.completed_at !== undefined && data.completed_at !== null) {
    errors.push('completed_at must be empty for non-completed sessions');
  }

  return errors;
}

/**
 * Normalize scheduling fields to UTC MySQL datetimes before storage. Unknown
 * fields are ignored (write is driven by an allowlist in updateStudySession).
 */
function normalizeScheduleFields(data) {
  const normalized = { ...data };
  if (data.starts_at !== undefined) {
    normalized.starts_at = toMysqlUtc(toInstant(data.starts_at));
  }
  if (data.ends_at !== undefined) {
    normalized.ends_at = toMysqlUtc(toInstant(data.ends_at));
  }
  if (data.completed_at !== undefined && data.completed_at !== null) {
    normalized.completed_at = toMysqlUtc(toInstant(data.completed_at));
  }
  return normalized;
}

/**
 * Create a new study session.
 */
async function createStudySession({
  studentId,
  title,
  subject,
  startsAt,
  endsAt,
  timezone,
  status = 'planned',
  actualMinutes = null,
  completedAt = null,
}) {
  const input = {
    title,
    subject,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    status,
    actual_minutes: actualMinutes,
    completed_at: completedAt,
  };

  const validationErrors = validateStudySessionData(input);
  if (validationErrors.length) {
    throw new Error(`Invalid study session data: ${validationErrors[0]}`);
  }

  const normalized = normalizeScheduleFields(input);
  const [result] = await pool.query(
    `INSERT INTO study_sessions
     (student_id, title, subject, starts_at, ends_at, timezone, status, actual_minutes, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      studentId,
      title.trim(),
      subject && subject.trim() ? subject.trim() : null,
      normalized.starts_at,
      normalized.ends_at,
      timezone,
      status,
      actualMinutes,
      completedAt ? toMysqlUtc(toInstant(completedAt)) : null,
    ]
  );

  return getStudySessionById(result.insertId);
}

/**
 * Get a study session by ID (raw row; datetimes serialize to ISO over JSON).
 */
async function getStudySessionById(sessionId) {
  const [rows] = await pool.query(
    `SELECT id, student_id, title, subject, starts_at, ends_at, timezone,
            status, actual_minutes, completed_at, created_at, updated_at
     FROM study_sessions WHERE id = ?`,
    [sessionId]
  );
  return rows[0] || null;
}

/**
 * Get a study session only when it belongs to the supplied student.
 */
async function getStudySessionByIdForStudent(sessionId, studentId) {
  const [rows] = await pool.query(
    `SELECT id, student_id, title, subject, starts_at, ends_at, timezone,
            status, actual_minutes, completed_at, created_at, updated_at
     FROM study_sessions WHERE id = ? AND student_id = ?`,
    [sessionId, studentId]
  );
  return rows[0] || null;
}

/**
 * Build a filtered WHERE clause for listing/counting sessions. Bounds are
 * normalized to UTC MySQL datetimes so the window is compared correctly.
 */
function buildSessionFilter(studentId, { startDate, endDate, status, subject } = {}) {
  const conditions = ['student_id = ?'];
  const values = [studentId];

  if (startDate) {
    conditions.push('starts_at >= ?');
    values.push(toMysqlUtc(toInstant(startDate)));
  }
  if (endDate) {
    conditions.push('starts_at < ?'); // half-open window
    values.push(toMysqlUtc(toInstant(endDate)));
  }
  if (status) {
    conditions.push('status = ?');
    values.push(status);
  }
  if (subject !== undefined && subject !== null && subject !== '') {
    conditions.push('subject = ?');
    values.push(subject);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

/**
 * Get study sessions for a student with date window, status, and subject filters.
 */
async function getStudySessionsByStudent(studentId, { startDate, endDate, status, subject, page = 1, size = 20 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(100, Math.max(1, Number(size) || 20));
  const offset = (safePage - 1) * safeSize;

  const { where, values } = buildSessionFilter(studentId, { startDate, endDate, status, subject });

  const [rows] = await pool.query(
    `SELECT id, student_id, title, subject, starts_at, ends_at, timezone,
            status, actual_minutes, completed_at, created_at, updated_at
     FROM study_sessions ${where}
     ORDER BY starts_at ASC, id ASC
     LIMIT ? OFFSET ?`,
    [...values, safeSize, offset]
  );

  return rows;
}

/**
 * Count study sessions for a student with the same filters.
 */
async function countStudySessionsByStudent(studentId, { startDate, endDate, status, subject } = {}) {
  const { where, values } = buildSessionFilter(studentId, { startDate, endDate, status, subject });
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM study_sessions ${where}`,
    values
  );
  return Number(row?.total) || 0;
}

/**
 * Full-window weekly summary for sessions whose scheduled start falls within
 * the half-open [startDate, endDate) window. Bounded aggregate query.
 */
async function getWeeklyStudySessionSummary(studentId, { startDate, endDate }) {
  const start = toMysqlUtc(toInstant(startDate));
  const end = toMysqlUtc(toInstant(endDate));

  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_sessions,
       SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) AS planned_sessions,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
       SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_sessions,
       SUM(CASE WHEN status IN ('planned', 'completed') THEN TIMESTAMPDIFF(MINUTE, starts_at, ends_at) ELSE 0 END) AS total_scheduled_minutes,
       SUM(CASE WHEN status = 'completed' THEN COALESCE(actual_minutes, 0) ELSE 0 END) AS total_actual_minutes
     FROM study_sessions
     WHERE student_id = ? AND starts_at >= ? AND starts_at < ?`,
    [studentId, start, end]
  );

  const row = rows[0] || {};
  return {
    total_sessions: Number(row.total_sessions) || 0,
    planned_sessions: Number(row.planned_sessions) || 0,
    completed_sessions: Number(row.completed_sessions) || 0,
    skipped_sessions: Number(row.skipped_sessions) || 0,
    total_scheduled_minutes: Number(row.total_scheduled_minutes) || 0,
    total_actual_minutes: Number(row.total_actual_minutes) || 0,
  };
}

/**
 * Update a study session (raw). Only allowlisted fields are applied.
 */
async function updateStudySession(sessionId, updates) {
  const allowedFields = [
    'title', 'subject', 'starts_at', 'ends_at', 'timezone',
    'status', 'actual_minutes', 'completed_at',
  ];

  const fields = [];
  const values = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (!fields.length) return false;

  values.push(sessionId);
  const [result] = await pool.query(
    `UPDATE study_sessions SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
}

/**
 * Update a study session that belongs to one student, applying lifecycle rules
 * (server-managed completed_at) and validation.
 */
async function updateStudySessionForStudent(studentId, sessionId, updates) {
  const current = await getStudySessionByIdForStudent(sessionId, studentId);
  if (!current) {
    return { found: false, updated: false, session: null };
  }

  const merged = { ...current, ...updates };
  const nextStatus = merged.status ?? current.status;

  if (nextStatus === 'completed' && current.status !== 'completed') {
    merged.completed_at = toIsoUtc(new Date());
  } else if (nextStatus !== 'completed') {
    merged.completed_at = null;
    if (nextStatus === 'planned') merged.actual_minutes = null;
  }

  const validationErrors = validateStudySessionData(merged);
  if (validationErrors.length) {
    throw new Error(`Invalid study session data: ${validationErrors[0]}`);
  }

  const normalized = normalizeScheduleFields(merged);
  const updated = await updateStudySession(sessionId, normalized);
  const session = updated ? await getStudySessionByIdForStudent(sessionId, studentId) : null;

  return { found: true, updated, session };
}

/**
 * Transition a session's status explicitly. Single source of truth for the
 * status state machine:
 *
 *   planned → completed   (requires actual_minutes, only after scheduled start)
 *   planned → skipped
 *   completed → planned   (reopen clears actual_minutes + completed_at)
 *   skipped → planned     (reopen clears actual_minutes + completed_at)
 *
 * Repeating the same status is idempotent (no new side effects).
 */
async function transitionStudySessionStatus(studentId, sessionId, status, { actualMinutes, now = new Date() } = {}) {
  const current = await getStudySessionByIdForStudent(sessionId, studentId);
  if (!current) return { found: false, valid: false, reason: 'not_found' };

  if (!VALID_STATUSES.includes(status)) {
    return { found: true, valid: false, reason: 'invalid_status' };
  }

  if (status === current.status) {
    return { found: true, valid: true, reason: null, session: current };
  }

  if (status === 'completed') {
    if (actualMinutes === undefined || actualMinutes === null || actualMinutes === '') {
      return { found: true, valid: false, reason: 'actual_minutes_required' };
    }
    const minutes = Number(actualMinutes);
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < MIN_ACTUAL_MINUTES || minutes > MAX_ACTUAL_MINUTES) {
      return { found: true, valid: false, reason: 'invalid_actual_minutes' };
    }
    if (now.getTime() < toInstant(current.starts_at).getTime()) {
      return { found: true, valid: false, reason: 'before_start' };
    }
  }

  const updates = { status };
  if (status === 'completed') {
    updates.actual_minutes = Number(actualMinutes);
    updates.completed_at = toIsoUtc(now);
  } else {
    updates.actual_minutes = null;
    updates.completed_at = null;
  }

  const updated = await updateStudySessionForStudent(studentId, sessionId, updates);
  return { found: true, valid: updated.updated, reason: null, session: updated.session };
}

/**
 * Delete a study session by ID (raw).
 */
async function deleteStudySession(sessionId) {
  const [result] = await pool.query(`DELETE FROM study_sessions WHERE id = ?`, [sessionId]);
  return result.affectedRows > 0;
}

/**
 * Delete a study session that belongs to one student.
 */
async function deleteStudySessionForStudent(studentId, sessionId) {
  const session = await getStudySessionByIdForStudent(sessionId, studentId);
  if (!session) return { found: false, deleted: false };
  const deleted = await deleteStudySession(sessionId);
  return { found: true, deleted };
}

module.exports = {
  ensureStudySessionsTable,
  parseUtcInstant,
  toInstant,
  toMysqlUtc,
  toIsoUtc,
  validateStudySessionData,
  createStudySession,
  getStudySessionById,
  getStudySessionByIdForStudent,
  getStudySessionsByStudent,
  countStudySessionsByStudent,
  getWeeklyStudySessionSummary,
  updateStudySession,
  updateStudySessionForStudent,
  transitionStudySessionStatus,
  deleteStudySession,
  deleteStudySessionForStudent,
  VALID_STATUSES,
  MIN_PLANNED_MINUTES,
  MAX_PLANNED_MINUTES,
  MIN_ACTUAL_MINUTES,
  MAX_ACTUAL_MINUTES,
};