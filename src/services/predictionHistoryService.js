'use strict';

/**
 * Prediction History Service — privacy-bounded recording of successful ML
 * inferences. Route/controller code supplies trusted actor, student, and kind.
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const { validatePredictionProfile } = require('../utils/mlValidation');
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
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

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
  FINGERPRINT_FIELDS,
  GRADE_ALLOWLIST,
  MAX_LATENCY_MS,
  PREDICTION_KINDS,
  generateInputFingerprint,
  validatePredictionEvent,
  insertPredictionEvent,
  recordPredictionEvent,
  ensurePredictionEventsTable,
};
