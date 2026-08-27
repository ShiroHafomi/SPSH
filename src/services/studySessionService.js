/**
 * Study Session Service — ALL SQL for study sessions.
 * Parameterized queries only. No raw SQL in controllers/routes.
 */
const { pool } = require('../config/db');
const { isCalendarDate } = require('./studyGoalService');

const VALID_STATUSES = ['planned', 'completed', 'skipped'];

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
 * Validate study session data.
 * @param {Object} data
 * @returns {Array<string>} Errors array
 */
function validateStudySessionData(data) {
  const errors = [];

  // Title validation
  if (!data.title || typeof data.title !== 'string') {
    errors.push('title is required and must be a string');
  } else {
    const trimmed = data.title.trim();
    if (!trimmed) {
      errors.push('title cannot be empty or only whitespace');
    } else if (trimmed.length > 120) {
      errors.push('title must be 120 characters or less');
    }
  }

  // Subject validation (optional)
  if (data.subject !== undefined && data.subject !== null) {
    if (typeof data.subject !== 'string') {
      errors.push('subject must be a string');
    } else {
      const trimmed = data.subject.trim();
      if (trimmed.length > 80) {
        errors.push('subject must be 80 characters or less');
      }
    }
  }

  // Starts at validation
  if (!data.starts_at) {
    errors.push('starts_at is required');
  } else if (!isCalendarDate(data.starts_at.split(' ')[0])) {
    // Handle datetime format YYYY-MM-DD HH:MM:SS
    errors.push('starts_at must be a valid date and time');
  }

  // Ends at validation
  if (!data.ends_at) {
    errors.push('ends_at is required');
  } else if (!isCalendarDate(data.ends_at.split(' ')[0])) {
    errors.push('ends_at must be a valid date and time');
  }

  // Timezone validation
  if (!data.timezone || typeof data.timezone !== 'string') {
    errors.push('timezone is required and must be a string');
  } else {
    // Basic timezone validation - in a real app, we'd validate against IANA timezone database
    if (!/^[A-Za-z_\/+-]+$/.test(data.timezone)) {
      errors.push('timezone must be a valid IANA timezone identifier');
    }
  }

  // Validate that ends_at is after starts_at
  if (data.starts_at && data.ends_at) {
    try {
      const starts = new Date(data.starts_at);
      const ends = new Date(data.ends_at);
      if (ends <= starts) {
        errors.push('ends_at must be after starts_at');
      }
    } catch (err) {
      errors.push('starts_at and ends_at must be valid dates');
    }
  }

  // Status validation
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push('status must be one of: planned, completed, skipped');
  }

  // Actual minutes validation (only for completed sessions)
  if (data.status === 'completed') {
    if (!data.actual_minutes && data.actual_minutes !== 0) {
      errors.push('actual_minutes is required for completed sessions');
    } else if (data.actual_minutes !== null && data.actual_minutes !== undefined) {
      const minutes = Number(data.actual_minutes);
      if (isNaN(minutes) || minutes < 1 || minutes > 720) {
        errors.push('actual_minutes must be between 1 and 720 for completed sessions');
      }
    }
  } else {
    // For non-completed sessions, actual_minutes should be null
    if (data.actual_minutes !== undefined && data.actual_minutes !== null) {
      errors.push('actual_minutes must be null for non-completed sessions');
    }
  }

  // Completed at validation (only for completed sessions)
  if (data.status === 'completed') {
    if (!data.completed_at) {
      errors.push('completed_at is required for completed sessions');
    } else if (!isCalendarDate(data.completed_at.split(' ')[0])) {
      errors.push('completed_at must be a valid date and time');
    }
  } else {
    // For non-completed sessions, completed_at should be null
    if (data.completed_at !== undefined && data.completed_at !== null) {
      errors.push('completed_at must be null for non-completed sessions');
    }
  }

  return errors;
}

/**
 * Create a new study session.
 * @param {Object} opts - { studentId, title, subject, startsAt, endsAt, timezone, status, actualMinutes, completedAt }
 * @returns {Promise<Object>} Created session
 */
async function createStudySession({ studentId, title, subject, startsAt, endsAt, timezone, status = 'planned', actualMinutes = null, completedAt = null }) {
  // Validate input
  const validationErrors = validateStudySessionData({
    title,
    subject,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    status,
    actual_minutes: actualMinutes,
    completed_at: completedAt
  });

  if (validationErrors.length) {
    throw new Error(`Invalid study session data: ${validationErrors[0]}`);
  }

  const [result] = await pool.query(
    `INSERT INTO study_sessions
     (student_id, title, subject, starts_at, ends_at, timezone, status, actual_minutes, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentId, title.trim(), subject ? subject.trim() : null, startsAt, endsAt, timezone, status, actualMinutes, completedAt]
  );

  return {
    id: result.insertId,
    student_id: studentId,
    title: title.trim(),
    subject: subject ? subject.trim() : null,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    status,
    actual_minutes: actualMinutes,
    completed_at: completedAt,
    created_at: new Date(),
    updated_at: new Date()
  };
}

/**
 * Get a study session by ID.
 * @param {number} sessionId
 * @returns {Promise<Object|null>}
 */
async function getStudySessionById(sessionId) {
  const [rows] = await pool.query(
    `SELECT * FROM study_sessions WHERE id = ?`,
    [sessionId]
  );
  return rows[0] || null;
}

/**
 * Get a study session only when it belongs to the supplied student.
 */
async function getStudySessionByIdForStudent(sessionId, studentId) {
  const [rows] = await pool.query(
    `SELECT * FROM study_sessions WHERE id = ? AND student_id = ?`,
    [sessionId, studentId]
  );
  return rows[0] || null;
}

/**
 * Get study sessions for a student with optional date window filtering.
 * @param {number} studentId
 * @param {Object} opts - { startDate, endDate, status, page, size }
 * @returns {Promise<Array>} Sessions
 */
async function getStudySessionsByStudent(studentId, { startDate, endDate, status, page = 1, size = 20 } = {}) {
  // Validate pagination
  const safePage = Math.max(1, Number(page)) || 1;
  const safeSize = Math.min(100, Math.max(1, Number(size))) || 20;
  const offset = (safePage - 1) * safeSize;

  // Build query conditions
  const conditions = ['student_id = ?'];
  const values = [studentId];

  if (startDate) {
    conditions.push('starts_at >= ?');
    values.push(startDate);
  }

  if (endDate) {
    conditions.push('starts_at < ?'); // Half-open interval: start <= x < end
    values.push(endDate);
  }

  if (status) {
    conditions.push('status = ?');
    values.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT * FROM study_sessions ${whereClause} ORDER BY starts_at ASC, id ASC LIMIT ? OFFSET ?`,
    [...values, safeSize, offset]
  );

  return rows;
}

/**
 * Count study sessions for a student with optional filtering.
 * @param {number} studentId
 * @param {Object} opts - { startDate, endDate, status }
 * @returns {Promise<number>} Count
 */
async function countStudySessionsByStudent(studentId, { startDate, endDate, status } = {}) {
  // Build query conditions
  const conditions = ['student_id = ?'];
  const values = [studentId];

  if (startDate) {
    conditions.push('starts_at >= ?');
    values.push(startDate);
  }

  if (endDate) {
    conditions.push('starts_at < ?');
    values.push(endDate);
  }

  if (status) {
    conditions.push('status = ?');
    values.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM study_sessions ${whereClause}`,
    values
  );

  return Number(row?.total) || 0;
}

/**
 * Get weekly summary for a student's study sessions.
 * @param {number} studentId
 * @param {Object} opts - { startDate, endDate } - week boundaries in student's timezone
 * @returns {Promise<Object>} Summary stats
 */
async function getWeeklyStudySessionSummary(studentId, { startDate, endDate }) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_sessions,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
       SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_sessions,
       SUM(CASE WHEN status IN ('planned', 'completed') THEN TIMESTAMPDIFF(MINUTE, starts_at, ends_at) ELSE 0 END) AS total_scheduled_minutes,
       SUM(CASE WHEN status = 'completed' THEN actual_minutes ELSE 0 END) AS total_actual_minutes
     FROM study_sessions
     WHERE student_id = ?
       AND starts_at >= ?
       AND starts_at < ?`,
    [studentId, startDate, endDate]
  );

  const row = rows[0];
  return {
    total_sessions: Number(row?.total_sessions) || 0,
    completed_sessions: Number(row?.completed_sessions) || 0,
    skipped_sessions: Number(row?.skipped_sessions) || 0,
    total_scheduled_minutes: Number(row?.total_scheduled_minutes) || 0,
    total_actual_minutes: Number(row?.total_actual_minutes) || 0
  };
}

/**
 * Update a study session by ID.
 * @param {number} sessionId
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
async function updateStudySession(sessionId, updates) {
  const allowedFields = [
    'title', 'subject', 'starts_at', 'ends_at', 'timezone',
    'status', 'actual_minutes', 'completed_at'
  ];

  const fields = [];
  const values = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (fields.length === 0) {
    return false;
  }

  values.push(sessionId);

  const [result] = await pool.query(
    `UPDATE study_sessions SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Update a study session that belongs to one student.
 * This prevents updating another student's session.
 * @param {number} studentId
 * @param {number} sessionId
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
async function updateStudySessionForStudent(studentId, sessionId, updates) {
  // First verify the session belongs to the student
  const session = await getStudySessionByIdForStudent(sessionId, studentId);
  if (!session) {
    return { found: false, updated: false };
  }

  // Validate the updates if they include critical fields
  const updateData = { ...session, ...updates };
  const validationErrors = validateStudySessionData(updateData);
  if (validationErrors.length) {
    throw new Error(`Invalid study session data: ${validationErrors[0]}`);
  }

  // Perform the update
  const updated = await updateStudySession(sessionId, updates);
  return { found: true, updated };
}

/**
 * Delete a study session by ID.
 * @param {number} sessionId
 * @returns {Promise<boolean>}
 */
async function deleteStudySession(sessionId) {
  const [result] = await pool.query(
    `DELETE FROM study_sessions WHERE id = ?`,
    [sessionId]
  );
  return result.affectedRows > 0;
}

/**
 * Delete a study session that belongs to one student.
 * This prevents deleting another student's session.
 * @param {number} studentId
 * @param {number} sessionId
 * @returns {Promise<Object>}
 */
async function deleteStudySessionForStudent(studentId, sessionId) {
  // First verify the session belongs to the student
  const session = await getStudySessionByIdForStudent(sessionId, studentId);
  if (!session) {
    return { found: false, deleted: false };
  }

  // Perform the deletion
  const deleted = await deleteStudySession(sessionId);
  return { found: true, deleted };
}

module.exports = {
  ensureStudySessionsTable,
  validateStudySessionData,
  createStudySession,
  getStudySessionById,
  getStudySessionByIdForStudent,
  getStudySessionsByStudent,
  countStudySessionsByStudent,
  getWeeklyStudySessionSummary,
  updateStudySession,
  updateStudySessionForStudent,
  deleteStudySession,
  deleteStudySessionForStudent,
  VALID_STATUSES
};