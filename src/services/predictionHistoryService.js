'use strict';

/**
 * Prediction History Service — privacy-bounded recording of successful ML
 * inferences. Route/controller code supplies trusted actor, student, and kind.
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const { validatePredictionProfile } = require('../utils/mlValidation');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');
const modelSnapshotService = require('./modelSnapshotService');

const PREDICTION_KINDS = Object.freeze([
  'prediction',
  'feedback',
  'baseline',
  'simulation',
]);
const GRADE_ALLOWLIST = Object.freeze(['A', 'B', 'C', 'D', 'F']);
const FINGERPRINT_FIELDS = Object.freeze([
  'gender',
  'age',
  'study_hours_per_day',
  'attendance_percent',
  'sleep_hours',
  'previous_gpa',
  'parental_education',
  'internet_access',
  'extracurricular',
  'part_time_job',
]);
const CONTEXT_FIELDS = new Set([
  'predictionKind',
  'actorUserId',
  'studentId',
  'inferenceLatencyMs',
]);
const EVENT_FIELDS = new Set([
  'actorUserId',
  'studentId',
  'modelSnapshotId',
  'predictionKind',
  'predictedScore',
  'predictedGrade',
  'gradeConfidence',
  'inferenceLatencyMs',
  'studyHours',
  'attendancePercent',
  'sleepHours',
  'previousGpa',
  'inputFingerprint',
]);
const MAX_LATENCY_MS = 60000;
const MAX_HISTORY_PAGE = 100000;
const MAX_HISTORY_PAGE_SIZE = 100;
const DEFAULT_HISTORY_PAGE_SIZE = 20;
const DEFAULT_HISTORY_WINDOW_DAYS = 30;
const MAX_HISTORY_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const HISTORY_FILTER_FIELDS = new Set([
  'page',
  'size',
  'from',
  'to',
  'kind',
  'modelVersion',
  'grade',
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertKnownFields(value, knownFields, label) {
  for (const key of Object.keys(value)) {
    if (!knownFields.has(key)) {
      throw new RangeError(`Unknown ${label} field: ${key}`);
    }
  }
}

function normalizeFingerprintValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }
  return null;
}

/**
 * Hash only approved model fields. Unknown values such as notes, credentials,
 * cookies, and arbitrary request metadata cannot affect or enter the record.
 */
function generateInputFingerprint(input) {
  assertPlainObject(input, 'Input');

  const canonical = {};
  for (const field of FINGERPRINT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      canonical[field] = normalizeFingerprintValue(input[field]);
    }
  }

  const serialized = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

function normalizeOptionalId(value, field) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer or null`);
  }
  return value;
}

function validatePredictionEvent(event) {
  assertPlainObject(event, 'Prediction event');
  assertKnownFields(event, EVENT_FIELDS, 'prediction event');

  const actorUserId = normalizeOptionalId(event.actorUserId, 'actor_user_id');
  const studentId = normalizeOptionalId(event.studentId, 'student_id');

  if (!Number.isSafeInteger(event.modelSnapshotId) || event.modelSnapshotId <= 0) {
    throw new RangeError('model_snapshot_id must be a positive safe integer');
  }
  if (typeof event.predictionKind !== 'string' || !PREDICTION_KINDS.includes(event.predictionKind)) {
    throw new RangeError(`prediction_kind must be one of: ${PREDICTION_KINDS.join(', ')}`);
  }
  if (!Number.isFinite(event.predictedScore) || event.predictedScore < 0 || event.predictedScore > 100) {
    throw new RangeError('predicted_score must be a finite number between 0 and 100');
  }
  if (typeof event.predictedGrade !== 'string' || !GRADE_ALLOWLIST.includes(event.predictedGrade)) {
    throw new RangeError(`predicted_grade must be one of: ${GRADE_ALLOWLIST.join(', ')}`);
  }
  if (!Number.isFinite(event.gradeConfidence) || event.gradeConfidence < 0 || event.gradeConfidence > 1) {
    throw new RangeError('grade_confidence must be a finite number between 0 and 1');
  }
  if (!Number.isInteger(event.inferenceLatencyMs) || event.inferenceLatencyMs < 0 || event.inferenceLatencyMs > MAX_LATENCY_MS) {
    throw new RangeError(`inference_latency_ms must be an integer between 0 and ${MAX_LATENCY_MS}`);
  }

  const behavioralFields = [
    ['study_hours', event.studyHours, 24, false],
    ['attendance_percent', event.attendancePercent, 100, true],
    ['sleep_hours', event.sleepHours, 24, false],
    ['previous_gpa', event.previousGpa, 4, false],
  ];
  for (const [name, value, max, integer] of behavioralFields) {
    if (value === null || value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) {
      throw new RangeError(`${name} must be ${integer ? 'an integer' : 'a finite number'} between 0 and ${max}`);
    }
  }

  if (typeof event.inputFingerprint !== 'string' || !SHA256_HEX_PATTERN.test(event.inputFingerprint)) {
    throw new RangeError('input_fingerprint must be a 64-character SHA-256 hash');
  }

  return {
    ...event,
    actorUserId,
    studentId,
    studyHours: event.studyHours ?? null,
    attendancePercent: event.attendancePercent ?? null,
    sleepHours: event.sleepHours ?? null,
    previousGpa: event.previousGpa ?? null,
  };
}

/**
 * Persist one fully populated successful event with parameterized SQL.
 */
async function insertPredictionEvent(event) {
  const validated = validatePredictionEvent(event);

  let result;
  try {
    [result] = await pool.query(
      `
      INSERT INTO ml_prediction_events
        (actor_user_id, student_id, model_snapshot_id, prediction_kind,
         predicted_score, predicted_grade, grade_confidence, inference_latency_ms,
         study_hours, attendance_percent, sleep_hours, previous_gpa, input_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        validated.actorUserId,
        validated.studentId,
        validated.modelSnapshotId,
        validated.predictionKind,
        validated.predictedScore,
        validated.predictedGrade,
        validated.gradeConfidence,
        validated.inferenceLatencyMs,
        validated.studyHours,
        validated.attendancePercent,
        validated.sleepHours,
        validated.previousGpa,
        validated.inputFingerprint,
      ]
    );
  } catch (err) {
    throw new Error('Failed to record prediction event');
  }

  if (!Number.isSafeInteger(result.insertId) || result.insertId <= 0) {
    throw new Error('Failed to record prediction event');
  }
  return result.insertId;
}

function validatePredictionResult(predictionResult) {
  assertPlainObject(predictionResult, 'Prediction result');
  const {
    final_score: predictedScore,
    grade: predictedGrade,
    grade_confidence: gradeConfidence,
  } = predictionResult;

  if (!Number.isFinite(predictedScore) || predictedScore < 0 || predictedScore > 100) {
    throw new RangeError('Prediction result final_score must be a finite number between 0 and 100');
  }
  if (typeof predictedGrade !== 'string' || !GRADE_ALLOWLIST.includes(predictedGrade)) {
    throw new RangeError(`Prediction result grade must be one of: ${GRADE_ALLOWLIST.join(', ')}`);
  }
  if (!Number.isFinite(gradeConfidence) || gradeConfidence < 0 || gradeConfidence > 1) {
    throw new RangeError('Prediction result grade_confidence must be a finite number between 0 and 1');
  }

  return { predictedScore, predictedGrade, gradeConfidence };
}

/**
 * Validate input/output/context and atomically insert the actual inference
 * result. No placeholder event is created before inference completes.
 */
async function recordPredictionEvent(predictionInput, predictionResult, context) {
  const normalizedInput = validatePredictionProfile(predictionInput);
  const normalizedResult = validatePredictionResult(predictionResult);
  assertPlainObject(context, 'Prediction context');
  assertKnownFields(context, CONTEXT_FIELDS, 'prediction context');

  const {
    predictionKind,
    actorUserId = null,
    studentId = null,
    inferenceLatencyMs,
  } = context;
  const { snapshotId, modelVersion } = await modelSnapshotService.getActiveSnapshot();
  const inputFingerprint = generateInputFingerprint(normalizedInput);

  const eventId = await insertPredictionEvent({
    actorUserId,
    studentId,
    modelSnapshotId: snapshotId,
    predictionKind,
    predictedScore: normalizedResult.predictedScore,
    predictedGrade: normalizedResult.predictedGrade,
    gradeConfidence: normalizedResult.gradeConfidence,
    inferenceLatencyMs,
    studyHours: normalizedInput.study_hours_per_day,
    attendancePercent: normalizedInput.attendance_percent,
    sleepHours: normalizedInput.sleep_hours,
    previousGpa: normalizedInput.previous_gpa,
    inputFingerprint,
  });

  return { eventId, snapshotId, modelVersion, inputFingerprint };
}

function parseIsoDate(value, field, endOfDay = false) {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be an ISO date string`);
  }
  const normalized = value.trim();
  const calendarMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (calendarMatch) {
    const year = Number(calendarMatch[1]);
    const month = Number(calendarMatch[2]);
    const day = Number(calendarMatch[3]);
    const date = new Date(
      `${normalized}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    );
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new RangeError(`${field} must be a valid ISO date`);
    }
    return date;
  }
  const timestampMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(normalized);
  if (!timestampMatch) {
    throw new RangeError(`${field} must be a UTC ISO date or timestamp`);
  }
  const date = new Date(normalized);
  const [year, month, day, hour, minute, second] = timestampMatch
    .slice(1, 7)
    .map(Number);
  const milliseconds = Number((timestampMatch[7] || '').padEnd(3, '0'));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== milliseconds
  ) {
    throw new RangeError(`${field} must be a valid ISO date`);
  }
  return date;
}

function normalizeHistoryFilters(options = {}, now = new Date()) {
  assertPlainObject(options, 'History filters');
  assertKnownFields(options, HISTORY_FILTER_FIELDS, 'history filter');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('History clock must be a valid Date');
  }

  const page = options.page === undefined ? 1 : parsePositiveSafeInteger(options.page);
  const size = options.size === undefined
    ? DEFAULT_HISTORY_PAGE_SIZE
    : parsePositiveSafeInteger(options.size);
  if (page === null || page > MAX_HISTORY_PAGE) {
    throw new RangeError(`page must be a positive integer no greater than ${MAX_HISTORY_PAGE}`);
  }
  if (size === null || size > MAX_HISTORY_PAGE_SIZE) {
    throw new RangeError(`size must be a positive integer no greater than ${MAX_HISTORY_PAGE_SIZE}`);
  }

  const to = options.to === undefined
    ? new Date(now.getTime())
    : parseIsoDate(options.to, 'to', true);
  const from = options.from === undefined
    ? new Date(to.getTime() - DEFAULT_HISTORY_WINDOW_DAYS * DAY_MS)
    : parseIsoDate(options.from, 'from');
  if (from.getTime() > to.getTime()) {
    throw new RangeError('from must not be later than to');
  }
  if (to.getTime() - from.getTime() > MAX_HISTORY_WINDOW_DAYS * DAY_MS) {
    throw new RangeError(`date range cannot exceed ${MAX_HISTORY_WINDOW_DAYS} days`);
  }

  const kind = options.kind === undefined ? null : options.kind;
  if (kind !== null && (typeof kind !== 'string' || !PREDICTION_KINDS.includes(kind))) {
    throw new RangeError(`kind must be one of: ${PREDICTION_KINDS.join(', ')}`);
  }
  const grade = options.grade === undefined ? null : options.grade;
  if (grade !== null && (typeof grade !== 'string' || !GRADE_ALLOWLIST.includes(grade))) {
    throw new RangeError(`grade must be one of: ${GRADE_ALLOWLIST.join(', ')}`);
  }
  const modelVersion = options.modelVersion === undefined ? null : options.modelVersion;
  if (
    modelVersion !== null &&
    (typeof modelVersion !== 'string' || !SHA256_HEX_PATTERN.test(modelVersion))
  ) {
    throw new RangeError('modelVersion must be a 64-character SHA-256 hash');
  }

  return {
    page,
    size,
    from,
    to,
    kind,
    modelVersion,
    grade,
  };
}

function buildHistoryWhere(filters) {
  const conditions = [
    'e.created_at >= ?',
    'e.created_at <= ?',
  ];
  const params = [filters.from, filters.to];
  if (filters.kind !== null) {
    conditions.push('e.prediction_kind = ?');
    params.push(filters.kind);
  }
  if (filters.modelVersion !== null) {
    conditions.push('s.model_version = ?');
    params.push(filters.modelVersion);
  }
  if (filters.grade !== null) {
    conditions.push('e.predicted_grade = ?');
    params.push(filters.grade);
  }
  return { where: conditions.join(' AND '), params };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeHistoryRow(row) {
  const createdAt = new Date(row.created_at);
  const studentId = Number(row.student_id);
  return {
    id: Number.isSafeInteger(Number(row.id)) ? Number(row.id) : null,
    createdAt: Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : null,
    predictionKind: PREDICTION_KINDS.includes(row.prediction_kind)
      ? row.prediction_kind
      : null,
    modelVersion: typeof row.model_version === 'string' && SHA256_HEX_PATTERN.test(row.model_version)
      ? row.model_version
      : null,
    predictedScore: finiteOrNull(row.predicted_score),
    predictedGrade: GRADE_ALLOWLIST.includes(row.predicted_grade)
      ? row.predicted_grade
      : null,
    gradeConfidence: finiteOrNull(row.grade_confidence),
    inferenceLatencyMs: finiteOrNull(row.inference_latency_ms),
    studentId: Number.isSafeInteger(studentId) && studentId > 0 ? studentId : null,
  };
}

async function listPredictionHistory(options = {}) {
  const filters = normalizeHistoryFilters(options);
  const { where, params } = buildHistoryWhere(filters);
  const offset = (filters.page - 1) * filters.size;
  const countSql = `
    SELECT COUNT(*) AS total
    FROM ml_prediction_events e
    INNER JOIN ml_model_snapshots s ON s.id = e.model_snapshot_id
    WHERE ${where}
  `;
  const rowsSql = `
    SELECT
      e.id,
      e.created_at,
      e.prediction_kind,
      s.model_version,
      e.predicted_score,
      e.predicted_grade,
      e.grade_confidence,
      e.inference_latency_ms,
      e.student_id
    FROM ml_prediction_events e
    INNER JOIN ml_model_snapshots s ON s.id = e.model_snapshot_id
    WHERE ${where}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ? OFFSET ?
  `;

  const [[countRows], [rows]] = await Promise.all([
    pool.query(countSql, params),
    pool.query(rowsSql, [...params, filters.size, offset]),
  ]);
  const totalValue = Number(countRows[0]?.total);
  const total = Number.isSafeInteger(totalValue) && totalValue >= 0 ? totalValue : 0;

  return {
    rows: Array.isArray(rows) ? rows.map(normalizeHistoryRow) : [],
    page: filters.page,
    size: filters.size,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / filters.size),
    filters: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      kind: filters.kind,
      modelVersion: filters.modelVersion,
      grade: filters.grade,
    },
  };
}

async function ensurePredictionEventsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ml_prediction_events (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      actor_user_id INT UNSIGNED NULL,
      student_id INT UNSIGNED NULL,
      model_snapshot_id INT UNSIGNED NOT NULL,
      prediction_kind ENUM('prediction', 'feedback', 'baseline', 'simulation') NOT NULL,
      predicted_score DECIMAL(5,2) NOT NULL,
      predicted_grade ENUM('A', 'B', 'C', 'D', 'F') NOT NULL,
      grade_confidence DECIMAL(4,3) NOT NULL,
      inference_latency_ms INT UNSIGNED NOT NULL,
      study_hours DECIMAL(4,2) NULL,
      attendance_percent TINYINT UNSIGNED NULL,
      sleep_hours DECIMAL(4,2) NULL,
      previous_gpa DECIMAL(3,2) NULL,
      input_fingerprint CHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prediction_events_created (created_at),
      INDEX idx_prediction_events_actor (actor_user_id, created_at),
      INDEX idx_prediction_events_student (student_id, created_at),
      INDEX idx_prediction_events_model (model_snapshot_id, created_at),
      INDEX idx_prediction_events_kind (prediction_kind, created_at),
      CONSTRAINT fk_prediction_events_model_snapshot
        FOREIGN KEY (model_snapshot_id) REFERENCES ml_model_snapshots(id)
        ON DELETE RESTRICT,
      CONSTRAINT fk_prediction_events_actor
        FOREIGN KEY (actor_user_id) REFERENCES users(id)
        ON DELETE SET NULL,
      CONSTRAINT fk_prediction_events_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = {
  DEFAULT_HISTORY_PAGE_SIZE,
  DEFAULT_HISTORY_WINDOW_DAYS,
  FINGERPRINT_FIELDS,
  GRADE_ALLOWLIST,
  MAX_HISTORY_PAGE,
  MAX_HISTORY_PAGE_SIZE,
  MAX_HISTORY_WINDOW_DAYS,
  MAX_LATENCY_MS,
  PREDICTION_KINDS,
  generateInputFingerprint,
  validatePredictionEvent,
  normalizeHistoryFilters,
  listPredictionHistory,
  insertPredictionEvent,
  recordPredictionEvent,
  ensurePredictionEventsTable,
};
