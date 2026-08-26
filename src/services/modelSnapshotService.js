'use strict';

/**
 * Model Snapshot Service — deterministic versioning for the active ML artifacts.
 */
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/db');

const MODELS_DIR = path.join(__dirname, '..', '..', 'ml', 'models');
const METRICS_FILE = path.join(MODELS_DIR, 'metrics.json');
const MAX_METRICS_SIZE = 64 * 1024;
const MAX_DRIFT_BASELINE_SIZE = 8 * 1024;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_FILES = Object.freeze([
  'regressor.joblib',
  'classifier.joblib',
  'preprocessor.joblib',
]);
const DRIFT_FEATURES = Object.freeze([
  'study_hours',
  'attendance_percent',
  'sleep_hours',
  'previous_gpa',
]);
const DRIFT_STAT_FIELDS = new Set([
  'sample_count',
  'mean',
  'standard_deviation',
  'minimum',
  'maximum',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        normalized[key] = normalizeJson(value[key]);
        return normalized;
      }, {});
  }
  return value;
}

function containsAbsolutePath(value) {
  if (Array.isArray(value)) {
    return value.some(containsAbsolutePath);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsAbsolutePath);
  }
  return typeof value === 'string' && (
    path.win32.isAbsolute(value) || path.posix.isAbsolute(value)
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMetricsValue(metricsValue) {
  if (Buffer.isBuffer(metricsValue)) metricsValue = metricsValue.toString('utf8');
  if (typeof metricsValue === 'string') {
    try {
      metricsValue = JSON.parse(metricsValue);
    } catch {
      throw new RangeError('metrics_json must contain valid JSON');
    }
  }
  if (!isPlainObject(metricsValue)) {
    throw new RangeError('Model metrics must be a JSON object');
  }
  return metricsValue;
}

function parseDriftBaseline(metricsValue) {
  const metrics = parseMetricsValue(metricsValue);
  const rawBaseline = metrics.drift_baseline;
  if (rawBaseline === undefined) return null;
  if (!isPlainObject(rawBaseline)) {
    throw new RangeError('drift_baseline must be an object');
  }
  if (Buffer.byteLength(JSON.stringify(rawBaseline), 'utf8') > MAX_DRIFT_BASELINE_SIZE) {
    throw new RangeError(`drift_baseline must not exceed ${MAX_DRIFT_BASELINE_SIZE} bytes`);
  }

  for (const feature of Object.keys(rawBaseline)) {
    if (!DRIFT_FEATURES.includes(feature)) {
      throw new RangeError(`Unknown drift baseline feature: ${feature}`);
    }
  }

  const baseline = {};
  for (const feature of DRIFT_FEATURES) {
    if (!Object.prototype.hasOwnProperty.call(rawBaseline, feature)) continue;
    const stats = rawBaseline[feature];
    if (!isPlainObject(stats)) {
      throw new RangeError(`drift_baseline.${feature} must be an object`);
    }
    for (const field of Object.keys(stats)) {
      if (!DRIFT_STAT_FIELDS.has(field)) {
        throw new RangeError(`Unknown drift baseline statistic: ${feature}.${field}`);
      }
    }

    const sampleCount = stats.sample_count;
    const mean = stats.mean;
    const standardDeviation = stats.standard_deviation;
    const minimum = stats.minimum;
    const maximum = stats.maximum;
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
      throw new RangeError(`drift_baseline.${feature}.sample_count must be a non-negative safe integer`);
    }
    for (const [field, value] of [
      ['mean', mean],
      ['standard_deviation', standardDeviation],
      ['minimum', minimum],
      ['maximum', maximum],
    ]) {
      if (!Number.isFinite(value)) {
        throw new RangeError(`drift_baseline.${feature}.${field} must be finite`);
      }
    }
    if (standardDeviation < 0) {
      throw new RangeError(`drift_baseline.${feature}.standard_deviation cannot be negative`);
    }
    if (minimum > maximum) {
      throw new RangeError(`drift_baseline.${feature}.minimum cannot exceed maximum`);
    }

    baseline[feature] = {
      sampleCount,
      mean,
      standardDeviation,
      minimum,
      maximum,
    };
  }
  return baseline;
}

async function readMetrics() {
  let buffer;
  try {
    buffer = await fs.readFile(METRICS_FILE);
  } catch (err) {
    throw new Error(`Failed to read model metrics (${err.code || 'unavailable'})`);
  }

  if (buffer.length > MAX_METRICS_SIZE) {
    throw new RangeError(`Model metrics must not exceed ${MAX_METRICS_SIZE} bytes`);
  }

  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Failed to parse model metrics JSON');
  }

  if (containsAbsolutePath(parsed)) {
    throw new RangeError('Model metrics must not contain absolute paths');
  }
  parseDriftBaseline(parsed);

  const metricsJson = JSON.stringify(normalizeJson(parsed));
  if (Buffer.byteLength(metricsJson, 'utf8') > MAX_METRICS_SIZE) {
    throw new RangeError(`Normalized model metrics must not exceed ${MAX_METRICS_SIZE} bytes`);
  }

  return metricsJson;
}

async function hashArtifact(filename) {
  let buffer;
  try {
    buffer = await fs.readFile(path.join(MODELS_DIR, filename));
  } catch {
    throw new Error(`Required model artifact unavailable: ${filename}`);
  }
  return sha256(buffer);
}

/**
 * Generate a stable SHA-256 version from normalized metrics and filename-bound
 * artifact hashes. Artifact names remain associated with their contents so
 * swapping two files cannot produce the same version.
 */
async function generateModelVersion() {
  const metricsJson = await readMetrics();
  const metricsHash = sha256(metricsJson);
  const artifactHashes = await Promise.all(
    ARTIFACT_FILES.map(async (filename) => ({
      filename,
      hash: await hashArtifact(filename),
    }))
  );

  const artifactRecords = artifactHashes.map(
    ({ filename, hash }) => `${filename}:${hash}`
  );
  const artifactFingerprint = sha256(artifactRecords.join('\n'));
  const modelVersion = sha256([
    `metrics:${metricsHash}`,
    ...artifactRecords,
  ].join('\n'));

  return { modelVersion, metricsJson, artifactFingerprint };
}

function validateSnapshotData(modelVersion, metricsJson, artifactFingerprint) {
  if (typeof modelVersion !== 'string' || !SHA256_HEX_PATTERN.test(modelVersion)) {
    throw new RangeError('model_version must be a 64-character SHA-256 hash');
  }
  if (typeof artifactFingerprint !== 'string' || !SHA256_HEX_PATTERN.test(artifactFingerprint)) {
    throw new RangeError('artifact_fingerprint must be a 64-character SHA-256 hash');
  }
  if (typeof metricsJson !== 'string') {
    throw new TypeError('metrics_json must be a JSON string');
  }
  if (Buffer.byteLength(metricsJson, 'utf8') > MAX_METRICS_SIZE) {
    throw new RangeError(`metrics_json must not exceed ${MAX_METRICS_SIZE} bytes`);
  }

  let parsed;
  try {
    parsed = JSON.parse(metricsJson);
  } catch {
    throw new RangeError('metrics_json must contain valid JSON');
  }
  if (containsAbsolutePath(parsed)) {
    throw new RangeError('metrics_json must not contain absolute paths');
  }
  parseDriftBaseline(parsed);
}

/**
 * Insert a snapshot idempotently. LAST_INSERT_ID returns the existing row ID
 * on a concurrent duplicate, so callers never need a read-then-write race.
 */
async function insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint) {
  validateSnapshotData(modelVersion, metricsJson, artifactFingerprint);

  const [result] = await pool.query(
    `
    INSERT INTO ml_model_snapshots
      (model_version, metrics_json, artifact_fingerprint)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
    `,
    [modelVersion, metricsJson, artifactFingerprint]
  );

  if (!Number.isSafeInteger(result.insertId) || result.insertId <= 0) {
    throw new Error('Database did not return a valid model snapshot ID');
  }

  return {
    snapshotId: result.insertId,
    inserted: result.affectedRows === 1,
  };
}

/**
 * Resolve the snapshot for the active files with one concurrency-safe insert.
 */
async function getActiveSnapshot() {
  const versionData = await generateModelVersion();
  const { snapshotId } = await insertModelSnapshot(
    versionData.modelVersion,
    versionData.metricsJson,
    versionData.artifactFingerprint
  );

  return {
    snapshotId,
    modelVersion: versionData.modelVersion,
  };
}

async function getModelSnapshot(modelVersion) {
  if (modelVersion !== undefined && (
    typeof modelVersion !== 'string' || !SHA256_HEX_PATTERN.test(modelVersion)
  )) {
    throw new RangeError('modelVersion must be a 64-character SHA-256 hash');
  }

  const params = [];
  let where = '';
  if (modelVersion !== undefined) {
    where = 'WHERE model_version = ?';
    params.push(modelVersion);
  }
  const [rows] = await pool.query(
    `
    SELECT id, model_version, metrics_json, created_at
    FROM ml_model_snapshots
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    params
  );
  if (!rows[0]) return null;

  let driftBaseline = null;
  try {
    driftBaseline = parseDriftBaseline(rows[0].metrics_json);
  } catch {
    driftBaseline = null;
  }
  return {
    snapshotId: rows[0].id,
    modelVersion: rows[0].model_version,
    driftBaseline,
    createdAt: rows[0].created_at,
  };
}

async function ensureModelSnapshotsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ml_model_snapshots (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      model_version CHAR(64) NOT NULL UNIQUE,
      metrics_json JSON NOT NULL,
      artifact_fingerprint CHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_model_snapshots_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = {
  ARTIFACT_FILES,
  DRIFT_FEATURES,
  MAX_DRIFT_BASELINE_SIZE,
  MAX_METRICS_SIZE,
  generateModelVersion,
  insertModelSnapshot,
  getActiveSnapshot,
  getModelSnapshot,
  parseDriftBaseline,
  ensureModelSnapshotsTable,
};
