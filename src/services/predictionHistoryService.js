'use strict';

/**
 * Prediction History Service — recording of ML prediction events for drift analysis.
 * Handles validation, normalization, and privacy-safe storage of prediction events.
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');
const modelSnapshotService = require('./modelSnapshotService');

const PREDICTION_KINDS = Object.freeze([
  'prediction',
  'feedback',
  'baseline',
  'simulation'
]);

const GRADE_ALLOWLIST = Object.freeze(['A', 'B', 'C', 'D', 'F']);
const MAX_LATENCY_MS = 60000; // 60 seconds
const SCORE_RANGE = {
  min: 0,
  max: 100
};

/**
 * Generate a privacy-safe input fingerprint from allowlisted behavioral fields.
 * Uses SHA-256 over normalized, sorted key-values.
 */
function generateInputFingerprint(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a plain object');
  }

  // Define allowlisted behavioral fields for fingerprinting
  const BEHAVIORAL_FIELDS = [
    'gender',
    'age',
    'study_hours_per_day',
    'attendance_percent',
    'sleep_hours',
    'previous_gpa',
    'parental_education',
    'internet_access',
    'extracurricular',
    'part_time_job'
  ];

  // Build normalized input with only allowlisted fields
  const normalized = {};
  for (const field of BEHAVIORAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      const value = input[field];
      // Normalize values for consistent hashing
      if (value === null || value === undefined) {
        normalized[field] = null;
      } else if (typeof value === 'boolean') {
        normalized[field] = value ? 1 : 0;
      } else if (typeof value === 'number') {
        normalized[field] = Number.isFinite(value) ? value : null;
      } else if (typeof value === 'string') {
        // Trim strings and normalize empty strings to null
        const trimmed = value.trim();
        normalized[field] = trimmed === '' ? null : trimmed;
      } else {
        // For other types, use JSON representation
        normalized[field] = value;
      }
    }
  }

  // Sort keys and create deterministic JSON string
  const sortedKeys = Object.keys(normalized).sort();
  const normalizedJSON = JSON.stringify(
    sortedKeys.reduce((obj, key) => {
      obj[key] = normalized[key];
      return obj;
    }, {})
  );

  // Generate SHA-256 hash
  return crypto
    .createHash('sha256')
    .update(normalizedJSON, 'utf-8')
    .digest('hex');
}

/**
 * Validate and normalize prediction event fields before persistence.
 * Throws on invalid input.
 */
function validatePredictionEvent({
  actorUserId,
  studentId,
  modelSnapshotId,
  predictionKind,
  predictedScore,
  predictedGrade,
  gradeConfidence,
  inferenceLatencyMs,
  studyHours,
  attendancePercent,
  sleepHours,
  previousGpa,
  inputFingerprint
}) {
  // Validate actor_user_id (can be null if not authenticated)
  if (actorUserId !== null && actorUserId !== undefined) {
    if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
      throw new RangeError('actor_user_id must be a positive integer or null');
    }
  } else {
    // Explicitly set to null if undefined
    actorUserId = null;
  }

  // Validate student_id (nullable, but if set must be positive integer)
  if (studentId !== null && studentId !== undefined) {
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      throw new RangeError('student_id must be a positive integer or null');
    }
  } else {
    studentId = null;
  }

  // Validate model_snapshot_id (required, must be positive integer)
  if (!Number.isSafeInteger(modelSnapshotId) || modelSnapshotId <= 0) {
    throw new RangeError('model_snapshot_id must be a positive integer');
  }

  // Validate prediction_kind (must be allowlisted)
  if (typeof predictionKind !== 'string' || !PREDICTION_KINDS.includes(predictionKind)) {
    throw new RangeError(
      `prediction_kind must be one of: ${PREDICTION_KINDS.join(', ')}`
    );
  }

  // Validate predicted_score (finite number within range)
  if (!Number.isFinite(predictedScore)) {
    throw new RangeError('predicted_score must be a finite number');
  }
  if (predictedScore < SCORE_RANGE.min || predictedScore > SCORE_RANGE.max) {
    throw new RangeError(
      `predicted_score must be between ${SCORE_RANGE.min} and ${SCORE_RANGE.max}`
    );
  }

  // Validate predicted_grade (must be in allowlist)
  if (typeof predictedGrade !== 'string' || !GRADE_ALLOWLIST.includes(predictedGrade)) {
    throw new RangeError(
      `predicted_grade must be one of: ${GRADE_ALLOWLIST.join(', ')}`
    );
  }

  // Validate grade_confidence (finite number between 0 and 1)
  if (!Number.isFinite(gradeConfidence)) {
    throw new RangeError('grade_confidence must be a finite number');
  }
  if (gradeConfidence < 0 || gradeConfidence > 1) {
    throw new RangeError('grade_confidence must be between 0 and 1');
  }

  // Validate inference_latency_ms (non-negative integer, bounded)
  if (!Number.isInteger(inferenceLatencyMs)) {
    throw new RangeError('inference_latency_ms must be an integer');
  }
  if (inferenceLatencyMs < 0) {
    throw new RangeError('inference_latency_ms must be non-negative');
  }
  if (inferenceLatencyMs > MAX_LATENCY_MS) {
    throw new RangeError(
      `inference_latency_ms must not exceed ${MAX_LATENCY_MS}ms`
    );
  }

  // Validate behavioral numeric fields (if provided)
  const behavioralFields = [
    { name: 'study_hours', value: studyHours, max: 24 },
    { name: 'attendance_percent', value: attendancePercent, max: 100 },
    { name: 'sleep_hours', value: sleepHours, max: 24 },
    { name: 'previous_gpa', value: previousGpa, max: 4.0 }
  ];

  for (const field of behavioralFields) {
    if (field.value !== null && field.value !== undefined) {
      if (!Number.isFinite(field.value)) {
        throw new RangeError(`${field.name} must be a finite number`);
      }
      if (field.value < 0) {
        throw new RangeError(`${field.name} must be non-negative`);
      }
      if (field.value > field.max) {
        throw new RangeError(`${field.name} must not exceed ${field.max}`);
      }
    }
  }

  // Validate input_fingerprint (string, expected SHA-256 length)
  if (typeof inputFingerprint !== 'string' || inputFingerprint.length !== 64) {
    throw new RangeError('input_fingerprint must be a 64-character hex string');
  }
  if (!/^[0-9a-f]+$/i.test(inputFingerprint)) {
    throw new RangeError('input_fingerprint must contain only hexadecimal characters');
  }
}

/**
 * Insert one successful prediction event.
 * Returns the event ID.
 */
async function insertPredictionEvent({
  actorUserId,
  studentId,
  modelSnapshotId,
  predictionKind,
  predictedScore,
  predictedGrade,
  gradeConfidence,
  inferenceLatencyMs,
  studyHours,
  attendancePercent,
  sleepHours,
  previousGpa,
  inputFingerprint
}) {
  // Validate all inputs
  validatePredictionEvent({
    actorUserId,
    studentId,
    modelSnapshotId,
    predictionKind,
    predictedScore,
    predictedGrade,
    gradeConfidence,
    inferenceLatencyMs,
    studyHours,
    attendancePercent,
    sleepHours,
    previousGpa,
    inputFingerprint
  });

  try {
    const [result] = await pool.query(
      `
      INSERT INTO ml_prediction_events
        (actor_user_id, student_id, model_snapshot_id, prediction_kind,
         predicted_score, predicted_grade, grade_confidence, inference_latency_ms,
         study_hours, attendance_percent, sleep_hours, previous_gpa, input_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        actorUserId ?? null,
        studentId ?? null,
        modelSnapshotId,
        predictionKind,
        predictedScore,
        predictedGrade,
        gradeConfidence,
        inferenceLatencyMs,
        studyHours ?? null,
        attendancePercent ?? null,
        sleepHours ?? null,
        previousGpa ?? null,
        inputFingerprint
      ]
    );

    return result.insertId;
  } catch (err) {
    // Log safely (don't include sensitive data in error messages)
    console.error('[predictionHistoryService] Failed to insert prediction event:', err.message);
    throw new Error('Failed to record prediction event');
  }
}

/**
 * Get or create the active model snapshot and record a prediction event.
 * Convenience method that combines snapshot retrieval with event insertion.
 */
async function recordPredictionEvent(predictionInput, options = {}) {
  const {
    predictionKind = 'prediction', // default, can be overridden by caller
    actorUserId = null, // will be set from auth context in controllers
    latencyMs = 0
  } = options;

  // Get active model snapshot
  const { snapshotId, modelVersion } = await modelSnapshotService.getActiveSnapshot();

  // Generate input fingerprint from the prediction input
  const inputFingerprint = generateInputFingerprint(predictionInput);

  // Extract behavioral fields for storage (with validation)
  const {
    gender,
    age,
    study_hours_per_day,
    attendance_percent,
    sleep_hours,
    previous_gpa,
    parental_education,
    internet_access,
    extracurricular,
    part_time_job
  } = predictionInput;

  // Insert the prediction event
  const eventId = await insertPredictionEvent({
    actorUserId,
    studentId: null, // TODO: resolve from actorUserId if needed, but nullable per spec
    modelSnapshotId: snapshotId,
    predictionKind,
    predictedScore: 0, // placeholder - will be updated after inference
    predictedGrade: 'F', // placeholder
    gradeConfidence: 0, // placeholder
    inferenceLatencyMs: latencyMs,
    studyHours: study_hours_per_day ?? null,
    attendancePercent: attendance_percent ?? null,
    sleepHours: sleep_hours ?? null,
    previousGpa: previous_gpa ?? null,
    inputFingerprint
  });

  return {
    eventId,
    snapshotId,
    modelVersion,
    inputFingerprint
  };
}

/**
 * Update a prediction event with the actual inference results.
 * Called after successful ML inference.
 */
async function updatePredictionEventWithResults(eventId, predictionResults) {
  // Validate prediction results
  if (!predictionResults || typeof predictionResults !== 'object') {
    throw new TypeError('Prediction results must be an object');
  }

  const {
    final_score: predictedScore,
    grade: predictedGrade,
    grade_confidence: gradeConfidence
  } = predictionResults;

  // Basic validation (full validation happens in insertPredictionEvent)
  if (!Number.isFinite(predictedScore) || predictedScore < 0 || predictedScore > 100) {
    throw new RangeError('Invalid predicted_score');
  }
  if (typeof predictedGrade !== 'string' || !['A', 'B', 'C', 'D', 'F'].includes(predictedGrade)) {
    throw new RangeError('Invalid predicted_grade');
  }
  if (!Number.isFinite(gradeConfidence) || gradeConfidence < 0 || gradeConfidence > 1) {
    throw new RangeError('Invalid grade_confidence');
  }

  try {
    await pool.query(
      `
      UPDATE ml_prediction_events
      SET predicted_score = ?,
          predicted_grade = ?,
          grade_confidence = ?
      WHERE id = ?
      `,
      [predictedScore, predictedGrade, gradeConfidence, eventId]
    );
  } catch (err) {
    console.error('[predictionHistoryService] Failed to update prediction event:', err.message);
    // Don't throw - persistence failure shouldn't fail the inference
  }
}

/**
 * Ensure the ml_prediction_events table exists.
 * Called during server startup.
 */
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
            attendance_percent INT UNSIGNED NULL,
            sleep_hours DECIMAL(4,2) NULL,
            previous_gpa DECIMAL(3,2) NULL,
            input_fingerprint CHAR(64) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

};

module.exports = {
    generateInputFingerprint,
    validatePredictionEvent,
    insertPredictionEvent,
    recordPredictionEvent,
    updatePredictionEventWithResults,
    ensurePredictionEventsTable
}