'use strict';

/**
 * Personal assignment service. All SQL lives here and all resource operations
 * are scoped by the authenticated student's internal student ID.
 */
const { pool } = require('../config/db');

const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const SORT_SQL = Object.freeze({
  due_asc: 'due_at ASC, id ASC',
  due_desc: 'due_at DESC, id DESC',
  created_desc: 'created_at DESC, id DESC',
  priority_desc: "FIELD(priority, 'high', 'medium', 'low'), due_at ASC, id ASC",
  title_asc: 'title ASC, id ASC',
});
const MAX_OFFSET = 100_000;

const MYSQL_DATETIME_MIN_MS = Date.parse('1000-01-01T00:00:00.000Z');
const MYSQL_DATETIME_MAX_MS = Date.parse('9999-12-31T23:59:59.999Z');

function hasValidCalendarComponents(match) {
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day;
}

function isMysqlDateTimeInstant(date) {
  const timestamp = date.getTime();
  return Number.isFinite(timestamp)
    && timestamp >= MYSQL_DATETIME_MIN_MS
    && timestamp <= MYSQL_DATETIME_MAX_MS;
}

function parseUtcInstant(value) {
  if (value instanceof Date) {
    return isMysqlDateTimeInstant(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const source = value.trim();
  if (!source) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(source)) return null;

  const components = source.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})$/i
  );
  if (!components || !hasValidCalendarComponents(components)) return null;

  const date = new Date(source);
  return isMysqlDateTimeInstant(date) ? date : null;
}

function parseStoredUtcInstant(value) {
  if (value instanceof Date) return parseUtcInstant(value);
  if (typeof value !== 'string') return null;

  const source = value.trim();
  const components = source.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/
  );
  if (!components || !hasValidCalendarComponents(components)) return null;

  const date = new Date(`${source.replace(' ', 'T')}Z`);
  return isMysqlDateTimeInstant(date) ? date : null;
}

function toMysqlUtc(date) {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function epochMsToIsoUtc(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isValidTimeZone(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function validateAssignmentData(data) {
  const errors = [];

  if (typeof data.title !== 'string' || data.title.trim() === '') {
    errors.push('title is required');
  } else if (data.title.trim().length > 160) {
    errors.push('title must be at most 160 characters');
  }

  if (data.subject !== undefined && data.subject !== null) {
    if (typeof data.subject !== 'string') errors.push('subject must be a string');
    else if (data.subject.trim().length > 80) errors.push('subject must be at most 80 characters');
  }

  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') errors.push('description must be a string');
    else if (data.description.length > 2000) errors.push('description must be at most 2000 characters');
  }

  if (!data.due_at) errors.push('due_at is required');
  else if (!parseUtcInstant(data.due_at)) errors.push('due_at must be a valid datetime with an explicit UTC offset');

  if (!isValidTimeZone(data.timezone)) {
    errors.push('timezone must be a valid IANA timezone identifier');
  }

  if (!VALID_PRIORITIES.includes(data.priority)) {
    errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (!VALID_STATUSES.includes(data.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return errors;
}

function configuredStudentTableSql() {
  const table = process.env.DB_TABLE || 'students';
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table)) {
    throw new Error('DB_TABLE must be a valid MySQL identifier.');
  }
  return `\`${table}\``;
}

const ASSIGNMENT_OWNER_INDEXES = Object.freeze({
  idx_assignments_owner_due: '(owner_user_id, student_id, due_at, id)',
  idx_assignments_owner_status_due: '(owner_user_id, student_id, status, due_at)',
  idx_assignments_owner_priority_due: '(owner_user_id, student_id, priority, due_at)',
});

async function ensureStudentAssignmentsTable() {
  const studentTable = configuredStudentTableSql();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_assignments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id INT UNSIGNED NOT NULL,
      owner_user_id INT UNSIGNED NOT NULL,
      title VARCHAR(160) NOT NULL,
      subject VARCHAR(80) NULL,
      description TEXT NULL,
      due_at DATETIME(6) NOT NULL,
      timezone VARCHAR(100) NOT NULL,
      priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
      status ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
      completed_at DATETIME(6) NULL,
      version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      INDEX idx_assignments_owner_due (owner_user_id, student_id, due_at, id),
      INDEX idx_assignments_owner_status_due (owner_user_id, student_id, status, due_at),
      INDEX idx_assignments_owner_priority_due (owner_user_id, student_id, priority, due_at),
      CONSTRAINT fk_student_assignments_student
        FOREIGN KEY (student_id) REFERENCES ${studentTable} (id) ON DELETE CASCADE,
      CONSTRAINT fk_student_assignments_owner
        FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [ownerColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_assignments'
       AND COLUMN_NAME = 'owner_user_id'`
  );
  if (ownerColumns.length === 0) {
    await pool.query(
      'ALTER TABLE student_assignments ADD COLUMN owner_user_id INT UNSIGNED NULL AFTER student_id'
    );
  }

  await pool.query(`
    UPDATE student_assignments AS assignment
    JOIN (
      SELECT student_id, MIN(id) AS owner_user_id
      FROM users
      WHERE role = 'student' AND is_active = 1 AND student_id IS NOT NULL
      GROUP BY student_id
      HAVING COUNT(*) = 1
    ) AS owner ON owner.student_id = assignment.student_id
    SET assignment.owner_user_id = owner.owner_user_id
    WHERE assignment.owner_user_id IS NULL
  `);

  const indexNames = Object.keys(ASSIGNMENT_OWNER_INDEXES);
  const [indexRows] = await pool.query(
    `SELECT DISTINCT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_assignments'
       AND INDEX_NAME IN (?, ?, ?)`,
    indexNames
  );
  const existingIndexes = new Set(indexRows.map((row) => row.INDEX_NAME));
  for (const [name, columns] of Object.entries(ASSIGNMENT_OWNER_INDEXES)) {
    if (existingIndexes.has(name)) continue;
    await pool.query(`ALTER TABLE student_assignments ADD INDEX ${name} ${columns}`);
  }

  const [ownerConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_assignments'
       AND CONSTRAINT_NAME = 'fk_student_assignments_owner'
       AND REFERENCED_TABLE_NAME = 'users'
       AND DELETE_RULE = 'CASCADE'`
  );
  if (ownerConstraints.length === 0) {
    await pool.query(
      `DELETE assignment
       FROM student_assignments AS assignment
       LEFT JOIN users AS owner ON owner.id = assignment.owner_user_id
       WHERE assignment.owner_user_id IS NOT NULL
         AND owner.id IS NULL`
    );
    await pool.query(
      `ALTER TABLE student_assignments
       ADD CONSTRAINT fk_student_assignments_owner
       FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE`
    );
  }
}

const ASSIGNMENT_COLUMNS = `id, student_id, title, subject, description,
  DATE_FORMAT(due_at, '%Y-%m-%d %H:%i:%s.%f') AS due_at,
  timezone, priority, status,
  DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s.%f') AS completed_at,
  version,
  ROUND(UNIX_TIMESTAMP(created_at) * 1000) AS created_at_epoch_ms,
  ROUND(UNIX_TIMESTAMP(updated_at) * 1000) AS updated_at_epoch_ms`;

function presentAssignment(row, asOf = new Date()) {
  if (!row) return null;
  const {
    created_at_epoch_ms: createdAtEpochMs,
    updated_at_epoch_ms: updatedAtEpochMs,
    ...assignment
  } = row;
  const dueAt = parseStoredUtcInstant(row.due_at);
  const completedAt = parseStoredUtcInstant(row.completed_at);
  const snapshot = parseUtcInstant(asOf) || new Date();
  return {
    ...assignment,
    id: Number(row.id),
    student_id: Number(row.student_id),
    version: Number(row.version),
    due_at: dueAt ? dueAt.toISOString() : null,
    completed_at: completedAt ? completedAt.toISOString() : null,
    created_at: epochMsToIsoUtc(createdAtEpochMs),
    updated_at: epochMsToIsoUtc(updatedAtEpochMs),
    isOverdue: row.status !== 'done' && Boolean(dueAt && dueAt.getTime() < snapshot.getTime()),
    completedLate: row.status === 'done'
      && Boolean(completedAt && dueAt && completedAt.getTime() > dueAt.getTime()),
  };
}

function normalizeAssignmentOwner(owner) {
  const studentId = Number(owner?.studentId);
  const userId = Number(owner?.userId);
  if (!Number.isSafeInteger(studentId) || studentId < 1 || !Number.isSafeInteger(userId) || userId < 1) {
    const error = new TypeError('Assignment owner must include positive student and user IDs.');
    error.code = 'INVALID_ASSIGNMENT_OWNER';
    throw error;
  }
  return { studentId, userId };
}

async function selectAssignmentForStudent(
  executor,
  assignmentId,
  owner,
  { asOf = new Date(), forUpdate = false } = {}
) {
  const { studentId, userId } = normalizeAssignmentOwner(owner);
  const [rows] = await executor.query(
    `SELECT ${ASSIGNMENT_COLUMNS}
     FROM student_assignments
     WHERE id = ? AND owner_user_id = ? AND student_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [assignmentId, userId, studentId]
  );
  return presentAssignment(rows[0] || null, asOf);
}

async function getAssignmentByIdForStudent(assignmentId, owner, { asOf = new Date() } = {}) {
  return selectAssignmentForStudent(pool, assignmentId, owner, { asOf });
}

async function createAssignmentForStudent(owner, data, { now = new Date() } = {}) {
  const { studentId, userId } = normalizeAssignmentOwner(owner);
  const normalized = {
    title: typeof data.title === 'string' ? data.title.trim() : data.title,
    subject: typeof data.subject === 'string' ? normalizeOptionalText(data.subject) : data.subject,
    description: typeof data.description === 'string' ? normalizeOptionalText(data.description) : data.description,
    due_at: data.due_at,
    timezone: data.timezone,
    priority: data.priority ?? 'medium',
    status: data.status ?? 'todo',
  };
  const errors = validateAssignmentData(normalized);
  if (errors.length) return { created: false, errors };

  const completedAt = normalized.status === 'done' ? now : null;
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [result] = await connection.query(
      `INSERT INTO student_assignments
         (student_id, owner_user_id, title, subject, description, due_at, timezone, priority, status, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        studentId,
        userId,
        normalized.title,
        normalized.subject,
        normalized.description,
        toMysqlUtc(parseUtcInstant(normalized.due_at)),
        normalized.timezone,
        normalized.priority,
        normalized.status,
        completedAt ? toMysqlUtc(completedAt) : null,
      ]
    );
    const [rows] = await connection.query(
      `SELECT ${ASSIGNMENT_COLUMNS}
       FROM student_assignments
       WHERE id = ? AND owner_user_id = ? AND student_id = ?`,
      [result.insertId, userId, studentId]
    );
    const assignment = presentAssignment(rows[0] || null, now);
    if (!assignment) {
      const error = new Error('Created assignment could not be read back.');
      error.code = 'ASSIGNMENT_READBACK_FAILED';
      throw error;
    }

    await connection.commit();
    transactionStarted = false;
    return { created: true, errors: [], assignment };
  } catch (err) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original creation failure.
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function buildAssignmentFilter(owner, options, asOf) {
  const { studentId, userId } = normalizeAssignmentOwner(owner);
  const conditions = ['owner_user_id = ?', 'student_id = ?'];
  const values = [userId, studentId];

  if (options.q) {
    const search = `%${escapeLike(options.q)}%`;
    conditions.push("(title LIKE ? ESCAPE '\\\\' OR subject LIKE ? ESCAPE '\\\\')");
    values.push(search, search);
  }
  if (options.subject) {
    conditions.push('subject = ?');
    values.push(options.subject);
  }
  if (options.status) {
    conditions.push('status = ?');
    values.push(options.status);
  }
  if (options.priority) {
    conditions.push('priority = ?');
    values.push(options.priority);
  }
  if (options.from) {
    conditions.push('due_at >= ?');
    values.push(toMysqlUtc(parseUtcInstant(options.from)));
  }
  if (options.to) {
    conditions.push('due_at < ?');
    values.push(toMysqlUtc(parseUtcInstant(options.to)));
  }
  if (options.overdue === true) {
    conditions.push("status <> 'done' AND due_at < ?");
    values.push(toMysqlUtc(asOf));
  } else if (options.overdue === false) {
    conditions.push("(status = 'done' OR due_at >= ?)");
    values.push(toMysqlUtc(asOf));
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, values };
}

async function listAssignmentsForStudent(owner, options, { now = new Date() } = {}) {
  const requestedOffset = (options.page - 1) * options.size;
  if (requestedOffset > MAX_OFFSET) {
    const error = new RangeError(`Pagination offset cannot exceed ${MAX_OFFSET}.`);
    error.code = 'OFFSET_TOO_LARGE';
    throw error;
  }

  const { where, values } = buildAssignmentFilter(owner, options, now);
  const orderBy = SORT_SQL[options.sort] || SORT_SQL.due_asc;
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    transactionStarted = true;

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM student_assignments
       ${where}`,
      values
    );
    const total = Number(countRow?.total) || 0;
    const totalPages = total === 0
      ? 0
      : Math.min(
        Math.ceil(total / options.size),
        Math.floor(MAX_OFFSET / options.size) + 1
      );
    const page = totalPages === 0 ? 1 : Math.min(options.page, totalPages);
    const offset = (page - 1) * options.size;

    const [rows] = await connection.query(
      `SELECT ${ASSIGNMENT_COLUMNS}
       FROM student_assignments
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...values, options.size, offset]
    );
    const [[summaryRow]] = await connection.query(
      `SELECT
         SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status <> 'done' AND due_at < ? THEN 1 ELSE 0 END) AS overdue
       FROM student_assignments
       ${where}`,
      [toMysqlUtc(now), ...values]
    );
    await connection.commit();
    transactionStarted = false;

    return {
      assignments: rows.map((row) => presentAssignment(row, now)),
      pagination: {
        page,
        size: options.size,
        total,
        totalPages,
      },
      summary: {
        todo: Number(summaryRow?.todo) || 0,
        inProgress: Number(summaryRow?.in_progress) || 0,
        done: Number(summaryRow?.done) || 0,
        overdue: Number(summaryRow?.overdue) || 0,
      },
      asOf: now.toISOString(),
    };
  } catch (err) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original query failure.
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

async function updateAssignmentUsingConnection(
  connection,
  owner,
  assignmentId,
  updates,
  expectedVersion,
  now
) {
  const { studentId, userId } = normalizeAssignmentOwner(owner);
  const current = await selectAssignmentForStudent(
    connection,
    assignmentId,
    { studentId, userId },
    { asOf: now, forUpdate: true }
  );
  if (!current) return { found: false, conflict: false, updated: false, assignment: null };
  if (current.version !== expectedVersion) {
    return { found: true, conflict: true, updated: false, assignment: current };
  }
  if (current.status === 'done' && updates.due_at !== undefined) {
    return { found: true, conflict: false, updated: false, reason: 'reopen_before_deadline_change', assignment: current };
  }

  const next = {
    title: updates.title !== undefined ? updates.title : current.title,
    subject: updates.subject !== undefined ? updates.subject : current.subject,
    description: updates.description !== undefined ? updates.description : current.description,
    due_at: updates.due_at !== undefined ? updates.due_at : current.due_at,
    timezone: updates.timezone !== undefined ? updates.timezone : current.timezone,
    priority: updates.priority !== undefined ? updates.priority : current.priority,
    status: updates.status !== undefined ? updates.status : current.status,
  };
  const errors = validateAssignmentData(next);
  if (errors.length) {
    return { found: true, conflict: false, updated: false, errors, assignment: current };
  }

  let completedAt = current.completed_at;
  if (current.status !== 'done' && next.status === 'done') completedAt = now.toISOString();
  if (current.status === 'done' && next.status !== 'done') completedAt = null;

  const fields = [];
  const values = [];
  for (const field of ['title', 'subject', 'description', 'due_at', 'timezone', 'priority', 'status']) {
    if (updates[field] === undefined) continue;
    fields.push(`${field} = ?`);
    if (field === 'due_at') values.push(toMysqlUtc(parseUtcInstant(next.due_at)));
    else if (field === 'title') values.push(next.title.trim());
    else if (field === 'subject' || field === 'description') values.push(normalizeOptionalText(next[field]));
    else values.push(next[field]);
  }

  if (current.status !== next.status) {
    fields.push('completed_at = ?');
    values.push(completedAt ? toMysqlUtc(parseUtcInstant(completedAt)) : null);
  }
  if (!fields.length) {
    return { found: true, conflict: false, updated: false, assignment: current };
  }

  fields.push('version = version + 1');
  const [result] = await connection.query(
    `UPDATE student_assignments
     SET ${fields.join(', ')}
     WHERE id = ? AND owner_user_id = ? AND student_id = ? AND version = ?`,
    [...values, assignmentId, userId, studentId, expectedVersion]
  );
  if (result.affectedRows === 0) {
    const latest = await selectAssignmentForStudent(connection, assignmentId, { studentId, userId }, { asOf: now });
    return { found: Boolean(latest), conflict: Boolean(latest), updated: false, assignment: latest };
  }

  const assignment = await selectAssignmentForStudent(connection, assignmentId, { studentId, userId }, { asOf: now });
  if (!assignment) {
    const error = new Error('Updated assignment could not be read back.');
    error.code = 'ASSIGNMENT_READBACK_FAILED';
    throw error;
  }
  return { found: true, conflict: false, updated: true, assignment };
}

async function updateAssignmentForStudent(
  owner,
  assignmentId,
  updates,
  expectedVersion,
  { now = new Date() } = {}
) {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await updateAssignmentUsingConnection(
      connection,
      owner,
      assignmentId,
      updates,
      expectedVersion,
      now
    );
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (err) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original update failure.
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

async function deleteAssignmentForStudent(owner, assignmentId, expectedVersion, { now = new Date() } = {}) {
  const { studentId, userId } = normalizeAssignmentOwner(owner);
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(version) || version < 1) {
    const error = new TypeError('Assignment version must be a positive integer.');
    error.code = 'INVALID_ASSIGNMENT_VERSION';
    throw error;
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const current = await selectAssignmentForStudent(
      connection,
      assignmentId,
      { studentId, userId },
      { asOf: now, forUpdate: true }
    );
    if (!current) {
      await connection.commit();
      transactionStarted = false;
      return { found: false, conflict: false, deleted: false, assignment: null };
    }
    if (current.version !== version) {
      await connection.commit();
      transactionStarted = false;
      return { found: true, conflict: true, deleted: false, assignment: current };
    }

    const [result] = await connection.query(
      `DELETE FROM student_assignments
       WHERE id = ? AND owner_user_id = ? AND student_id = ? AND version = ?`,
      [assignmentId, userId, studentId, version]
    );
    if (result.affectedRows !== 1) {
      const error = new Error('Assignment could not be deleted at the expected version.');
      error.code = 'ASSIGNMENT_DELETE_FAILED';
      throw error;
    }

    await connection.commit();
    transactionStarted = false;
    return { found: true, conflict: false, deleted: true, assignment: null };
  } catch (err) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original deletion failure.
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  MAX_OFFSET,
  SORT_SQL,
  VALID_PRIORITIES,
  VALID_STATUSES,
  buildAssignmentFilter,
  createAssignmentForStudent,
  deleteAssignmentForStudent,
  ensureStudentAssignmentsTable,
  getAssignmentByIdForStudent,
  isValidTimeZone,
  listAssignmentsForStudent,
  parseUtcInstant,
  presentAssignment,
  toMysqlUtc,
  updateAssignmentForStudent,
  validateAssignmentData,
};
