'use strict';

/**
 * Model Snapshot Service — versioning and tracking of ML model snapshots.
 * Generates stable model versions based on normalized metrics and artifact fingerprints.
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const fs = require('fs').promises;
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', '..', 'ml', 'models');
const METRICS_FILE = path.join(MODELS_DIR, 'metrics.json');
const MAX_METRICS_SIZE = 64 * 1024; // 64 KiB

const ARTIFACT_FILES = [
  'regressor.joblib',
  'classifier.joblib',
  'preprocessor.joblib'
];

/**
 * Generate a stable model version hash based on:
 * - Normalized metrics.json (sorted keys)
 * - SHA-256 hashes of active joblib artifacts
 */
async function generateModelVersion() {
  try {
    // Read and normalize metrics.json
    let metricsContent = '';
    try {
      const metricsBuffer = await fs.readFile(METRICS_FILE);
      // Limit size to prevent DoS
      if (metricsBuffer.length > MAX_METRICS_SIZE) {
        throw new Error('Metrics file too large');
      }
      metricsContent = metricsBuffer.toString('utf-8');
    } catch (err) {
      throw new Error(`Failed to read metrics: ${err.message}`);
    }

    let metricsObj;
    try {
      metricsObj = JSON.parse(metricsContent);
    } catch (err) {
      throw new Error(`Failed to parse metrics JSON: ${err.message}`);
    }

    // Normalize: sort object keys recursively
    const normalizedMetrics = JSON.stringify(
      metricsObj,
      (key, value) => {
        // Sort objects by key, leave arrays as-is
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return Object.keys(value)
            .sort()
            .reduce((obj, k) => {
              obj[k] = value[k];
              return obj;
            }, {});
        }
        return value;
      }
    );

    // Generate hash of normalized metrics
    const metricsHash = crypto
      .createHash('sha256')
      .update(normalizedMetrics, 'utf-8')
      .digest('hex');

    // Generate hashes of artifact files
    const artifactHashes = await Promise.all(
      ARTIFACT_FILES.map(async (filename) => {
        const filePath = path.join(MODELS_DIR, filename);
        try {
          const buffer = await fs.readFile(filePath);
          return crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex');
        } catch (err) {
          // If artifact missing, we'll handle it in the version generation
          return null;
        }
      })
    );

    // Filter out null hashes (missing files) and sort for consistency
    const validArtifactHashes = artifactHashes
      .filter((hash) => hash !== null)
      .sort();

    // Combine metrics hash with artifact hashes
    const combinedInput = [
      metricsHash,
      ...validArtifactHashes,
      ...ARTIFACT_FILES // Include filenames for version stability
    ].join('|');

    const modelVersion = crypto
      .createHash('sha256')
      .update(combinedInput, 'utf-8')
      .digest('hex');

    // Also create an artifact fingerprint (simpler version for change detection)
    const artifactFingerprint = crypto
      .createHash('sha256')
      .update(
        [metricsHash, ...validArtifactHashes].join('|'),
        'utf-8'
      )
      .digest('hex');

    return {
      modelVersion,
      metricsJson: normalizedMetrics,
      artifactFingerprint,
    };
  } catch (err) {
    // Re-throw with context
    throw new Error(`Failed to generate model version: ${err.message}`);
  }
}

/**
 * Insert a model snapshot idempotently.
 * Returns the snapshot ID and whether it was inserted (true) or already existed (false).
 */
async function insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint) {
  try {
    const [result] = await pool.query(
      `
      INSERT INTO ml_model_snapshots
        (model_version, metrics_json, artifact_fingerprint)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
      `,
      [modelVersion, metricsJson, artifactFingerprint]
    );

    // If affectedRows is 1, it was inserted; if 2, it was updated (duplicate key)
    const inserted = result.affectedRows === 1;
    const snapshotId = result.insertId;

    return { snapshotId, inserted };
  } catch (err) {
    throw new Error(`Failed to insert model snapshot: ${err.message}`);
  }
}

/**
 * Get the active model snapshot ID and version.
 * If no snapshot exists, creates one from current models.
 */
async function getActiveSnapshot() {
  try {
    // First, try to get the most recent snapshot
    const [rows] = await pool.query(
      `
      SELECT id, model_version, metrics_json, artifact_fingerprint, created_at
      FROM ml_model_snapshots
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `
    );

    if (rows.length > 0) {
      const row = rows[0];
      // Verify that the snapshot still matches current models
      const currentVersionData = await generateModelVersion();

      if (
        row.model_version === currentVersionData.modelVersion &&
        row.artifact_fingerprint === currentVersionData.artifactFingerprint
      ) {
        // Current models match the most recent snapshot
        return {
          snapshotId: row.id,
          modelVersion: row.model_version,
        };
      }
      // Otherwise, fall through to create a new snapshot
    }

    // No existing snapshot or mismatch - create new one
    const versionData = await generateModelVersion();
    const { snapshotId, inserted } = await insertModelSnapshot(
      versionData.modelVersion,
      versionData.metricsJson,
      versionData.artifactFingerprint
    );

    return {
      snapshotId,
      modelVersion: versionData.modelVersion,
    };
  } catch (err) {
    throw new Error(`Failed to get active model snapshot: ${err.message}`);
  }
}

/**
 * Ensure the ml_model_snapshots table exists.
 * Called during server startup.
 */
async function ensureModelSnapshotsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ml_model_snapshots (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      model_version VARCHAR(64) NOT NULL UNIQUE,
      metrics_json JSON NOT NULL,
      artifact_fingerprint VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_model_snapshots_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = {
  generateModelVersion,
  insertModelSnapshot,
  getActiveSnapshot,
  ensureModelSnapshotsTable,
};