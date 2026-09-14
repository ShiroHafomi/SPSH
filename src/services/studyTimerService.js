'use strict';

const { pool } = require('../config/db');
const { parseUtcInstant, toMysqlUtc } = require('./assignmentService');
const { MAX_SECONDS, MAX_VERSION, StudyTimerError, positiveId, startInput, actionInput, windowInput, timerState } = require('../utils/studyTimerValidation');

const COLUMNS = `id, student_id, owner_user_id, assignment_id, title, status, accumulated_seconds, version, clock_adjusted,
  DATE_FORMAT(started_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS started_at,
  DATE_FORMAT(running_since, '%Y-%m-%dT%H:%i:%s.%fZ') AS running_since,
  DATE_FORMAT(ended_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS ended_at,
  DATE_FORMAT(last_observed_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS last_observed_at`;
function studentTable() {
  const table = process.env.DB_TABLE || 'students';
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table)) throw new Error('Invalid student table.');
  return `\`${table}\``;
}
async function ensureStudyTimersTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS study_session_timers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    owner_user_id INT UNSIGNED NOT NULL,
    assignment_id INT UNSIGNED NULL,
    title VARCHAR(150) NOT NULL,
    status ENUM('running', 'paused', 'completed', 'discarded') NOT NULL DEFAULT 'running',
    started_at DATETIME(3) NOT NULL,
    running_since DATETIME(3) NULL,
    accumulated_seconds DECIMAL(11,3) NOT NULL DEFAULT 0,
    ended_at DATETIME(3) NULL,
    last_observed_at DATETIME(3) NOT NULL,
    clock_adjusted TINYINT(1) NOT NULL DEFAULT 0,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    unfinished_slot TINYINT UNSIGNED GENERATED ALWAYS AS
      (CASE WHEN status IN ('running', 'paused') THEN 1 ELSE NULL END) STORED,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_study_timer_unfinished (student_id, unfinished_slot),
    INDEX idx_study_timer_history (student_id, owner_user_id, ended_at, id),
    INDEX idx_study_timer_status (student_id, owner_user_id, status, ended_at, id),
    INDEX idx_study_timer_start (student_id, started_at, id),
    CONSTRAINT fk_study_timer_student FOREIGN KEY (student_id) REFERENCES ${studentTable()} (id) ON DELETE CASCADE,
    CONSTRAINT fk_study_timer_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_study_timer_assignment FOREIGN KEY (assignment_id) REFERENCES student_assignments (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
function owner(actor) {
  if (!actor || !actor.id) throw new StudyTimerError(401, 'AUTH_REQUIRED', 'Authentication required.');
  if (actor.role !== 'student' || !actor.studentId) throw new StudyTimerError(403, 'STUDY_TIMER_FORBIDDEN', 'Student access required.');
  return { studentId: positiveId(actor.studentId), userId: positiveId(actor.id) };
}
function conflict(code = 'STUDY_TIMER_CONFLICT') {
  throw new StudyTimerError(409, code, 'Study timer changed or this action is unavailable. Refresh and try again.');
}
async function transaction(operation) {
  const db = await pool.getConnection();
  let started = false;
  try {
    await db.beginTransaction(); started = true;
    const result = await operation(db);
    await db.commit(); started = false;
    return result;
  } catch (error) {
    if (started) { try { await db.rollback(); } catch {} }
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) conflict(error.code === 'ER_DUP_ENTRY' ? 'STUDY_TIMER_UNFINISHED_EXISTS' : 'STUDY_TIMER_CONFLICT');
    throw error;
  } finally { db.release(); }
}
async function clock(db) {
  const [[row]] = await db.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  const now = parseUtcInstant(row?.now);
  if (!now) throw new Error('Invalid database clock.');
  return now;
}
async function select(db, scope, id) {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM study_session_timers
    WHERE student_id = ? AND owner_user_id = ? AND ${id == null ? "status IN ('running', 'paused')" : 'id = ?'}
    LIMIT 1 FOR UPDATE`, [scope.studentId, scope.userId, ...(id == null ? [] : [id])]);
  return rows[0] || null;
}
function present(row, now) {
  if (!row) return null;
  const state = timerState(row, now);
  return {
    id: Number(row.id), assignment_id: row.assignment_id == null ? null : Number(row.assignment_id),
    title: row.title, status: row.status, version: Number(row.version),
    started_at: parseUtcInstant(row.started_at)?.toISOString() || null,
    running_since: row.running_since ? parseUtcInstant(row.running_since)?.toISOString() || null : null,
    ended_at: row.ended_at ? parseUtcInstant(row.ended_at)?.toISOString() || null : null,
    accumulated_seconds: Number(row.accumulated_seconds), elapsedSeconds: state.elapsedSeconds,
    limitReached: state.limitReached, clockAdjusted: Boolean(Number(row.clock_adjusted)) || state.clockAdjusted,
  };
}
function envelope(row, now) { return { session: present(row, now), serverNow: now.toISOString(), maxSeconds: MAX_SECONDS }; }
async function save(db, scope, row, values) {
  if (Number(row.version) >= MAX_VERSION) conflict();
  const [result] = await db.query(`UPDATE study_session_timers SET status = ?, accumulated_seconds = ?, running_since = ?,
    ended_at = ?, last_observed_at = ?, clock_adjusted = ?, version = version + 1
    WHERE id = ? AND student_id = ? AND owner_user_id = ? AND version = ?`,
  [values.status, values.accumulated_seconds, values.running_since ? toMysqlUtc(parseUtcInstant(values.running_since)) : null,
    values.ended_at ? toMysqlUtc(parseUtcInstant(values.ended_at)) : null, toMysqlUtc(parseUtcInstant(values.last_observed_at)),
    values.clock_adjusted, row.id, scope.studentId, scope.userId, row.version]);
  if (result.affectedRows !== 1) conflict();
  return { ...row, ...values, version: Number(row.version) + 1 };
}
async function current(actor) {
  const scope = owner(actor);
  return transaction(async db => {
    let row = await select(db, scope);
    const now = await clock(db);
    if (row) {
      const state = timerState(row, now);
      if (row.status === 'running' && (state.limitReached || state.clockAdjusted)) {
        row = await save(db, scope, row, { status: 'paused', accumulated_seconds: state.elapsedSeconds,
          running_since: null, ended_at: null, last_observed_at: state.effective.toISOString(),
          clock_adjusted: Number(row.clock_adjusted) || Number(state.clockAdjusted) });
      } else if (now > parseUtcInstant(row.last_observed_at)) {
        // The high-water mark detects clock rollback without invalidating user action versions on ordinary reads.
        await db.query('UPDATE study_session_timers SET last_observed_at = ? WHERE id = ? AND student_id = ? AND owner_user_id = ? AND version = ?',
          [toMysqlUtc(now), row.id, scope.studentId, scope.userId, row.version]);
        row.last_observed_at = now.toISOString();
      }
    }
    return envelope(row, now);
  });
}
async function start(actor, input) {
  const scope = owner(actor), data = startInput(input);
  return transaction(async db => {
    if (data.assignmentId !== null) {
      const [rows] = await db.query(`SELECT id FROM student_assignments WHERE id = ? AND owner_user_id = ? AND student_id = ? LIMIT 1 FOR SHARE`,
        [data.assignmentId, scope.userId, scope.studentId]);
      if (!rows.length) throw new StudyTimerError(404, 'STUDY_TIMER_ASSIGNMENT_UNAVAILABLE', 'Assignment is unavailable.');
    }
    const now = await clock(db), instant = toMysqlUtc(now);
    // MySQL's unique generated key, not a read-before-insert check, arbitrates simultaneous starts.
    const [result] = await db.query(`INSERT INTO study_session_timers
      (student_id, owner_user_id, assignment_id, title, started_at, running_since, last_observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [scope.studentId, scope.userId, data.assignmentId, data.title, instant, instant, instant]);
    const row = await select(db, scope, result.insertId);
    if (!row) throw new Error('Timer readback failed.');
    const startedAt = await clock(db);
    // A successful insert may have waited for a competing transaction to roll back.
    await db.query(`UPDATE study_session_timers SET started_at = ?, running_since = ?, last_observed_at = ?
      WHERE id = ? AND student_id = ? AND owner_user_id = ?`,
    [toMysqlUtc(startedAt), toMysqlUtc(startedAt), toMysqlUtc(startedAt), row.id, scope.studentId, scope.userId]);
    return envelope({ ...row, started_at: startedAt.toISOString(), running_since: startedAt.toISOString(), last_observed_at: startedAt.toISOString() }, startedAt);
  });
}
async function transition(actor, sessionId, action, input) {
  const scope = owner(actor), id = positiveId(sessionId), version = actionInput(input);
  if (!['pause', 'resume', 'finish', 'discard'].includes(action)) conflict('STUDY_TIMER_INVALID_TRANSITION');
  return transaction(async db => {
    const row = await select(db, scope, id);
    if (!row) throw new StudyTimerError(404, 'STUDY_TIMER_NOT_FOUND', 'Study timer not found.');
    if (Number(row.version) !== version) conflict();
    const now = await clock(db), state = timerState(row, now);
    const target = { pause: 'paused', resume: 'running', finish: 'completed', discard: 'discarded' }[action];
    if (row.status === target) return envelope(row, now);
    if (!['running', 'paused'].includes(row.status) || (action === 'resume' && row.status !== 'paused')) conflict('STUDY_TIMER_INVALID_TRANSITION');
    if (action === 'resume' && state.limitReached) conflict('STUDY_TIMER_LIMIT_REACHED');
    if (action === 'resume' && state.clockAdjusted) conflict('STUDY_TIMER_CLOCK_ADJUSTED');
    const updated = await save(db, scope, row, { status: target, accumulated_seconds: state.elapsedSeconds,
      running_since: target === 'running' ? state.effective.toISOString() : null,
      ended_at: ['completed', 'discarded'].includes(target) ? state.effective.toISOString() : null,
      last_observed_at: state.effective.toISOString(), clock_adjusted: Number(row.clock_adjusted) || Number(state.clockAdjusted) });
    return envelope(updated, now);
  });
}
function windowMeta(window) { return { from: window.from, to: window.to, timeZone: 'UTC', grouping: 'completion_date' }; }
async function history(actor, input) {
  const scope = owner(actor);
  return transaction(async db => {
    const now = await clock(db), window = windowInput(input, now, true);
    const where = `student_id = ? AND owner_user_id = ? AND status ${window.status ? '= ?' : "IN ('completed', 'discarded')"} AND ended_at >= ? AND ended_at < ?`;
    const args = [scope.studentId, scope.userId, ...(window.status ? [window.status] : []), toMysqlUtc(window.start), toMysqlUtc(window.end)];
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM study_session_timers WHERE ${where}`, args);
    const total = finite(count.total), totalPages = Math.min(Math.ceil(total / window.size), Math.floor(100000 / window.size) + 1);
    const page = totalPages ? Math.min(window.page, totalPages) : 1;
    const [rows] = await db.query(`SELECT ${COLUMNS} FROM study_session_timers WHERE ${where}
      ORDER BY ended_at DESC, id DESC LIMIT ? OFFSET ?`, [...args, window.size, (page - 1) * window.size]);
    return { sessions: rows.map(row => present(row, now)), pagination: { page, size: window.size, total, totalPages }, ...windowMeta(window), grouping: 'end_date' };
  });
}
function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) throw new Error('Invalid timer aggregate.');
  return number;
}
async function summary(actor, input) {
  const scope = owner(actor);
  return transaction(async db => {
    const now = await clock(db), window = windowInput(input, now);
    const [rows] = await db.query(`SELECT DATE_FORMAT(ended_at, '%Y-%m-%d') AS date,
      COUNT(*) AS completedSessionCount, COALESCE(SUM(accumulated_seconds), 0) AS totalCompletedSeconds,
      COALESCE(AVG(accumulated_seconds), 0) AS averageCompletedSeconds
      FROM study_session_timers WHERE student_id = ? AND owner_user_id = ? AND status = 'completed'
      AND ended_at >= ? AND ended_at < ? GROUP BY DATE_FORMAT(ended_at, '%Y-%m-%d') WITH ROLLUP`,
    [scope.studentId, scope.userId, toMysqlUtc(window.start), toMysqlUtc(window.end)]);
    const totals = rows.find(row => row.date === null) || {};
    const byDate = new Map(rows.filter(row => row.date).map(row => [row.date, row]));
    const daily = [];
    for (let day = window.start.getTime(); day < window.end.getTime(); day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10), row = byDate.get(date);
      daily.push({ date, completedSessionCount: finite(row?.completedSessionCount || 0), totalCompletedSeconds: finite(row?.totalCompletedSeconds || 0) });
    }
    return { ...windowMeta(window), completedSessionCount: finite(totals.completedSessionCount || 0),
      totalCompletedSeconds: finite(totals.totalCompletedSeconds || 0), averageCompletedSeconds: finite(totals.averageCompletedSeconds || 0), daily };
  });
}
module.exports = { ensureStudyTimersTable, current, start, transition, history, summary };
