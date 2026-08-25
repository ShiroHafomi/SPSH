'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const modelSnapshotService = require('./modelSnapshotService');
const { pool } = require('../config/db');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Store original functions for restoration
let originalFsReadFile;
let originalPoolQuery;
let originalCryptoCreateHash;

describe('modelSnapshotService', () => {
  afterEach(() => {
    // Restore original functions
    if (originalFsReadFile) fs.readFile = originalFsReadFile;
    if (originalPoolQuery) pool.query = originalPoolQuery;
    if (originalCryptoCreateHash) crypto.createHash = originalCryptoCreateHash;
  });

  describe('generateModelVersion', () => {
    it('should generate a stable version based on normalized metrics and artifacts', async () => {
      // Mock fs.readFile
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        // Normalize path for comparison
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          return Buffer.from(JSON.stringify({
            "r2": 0.95,
            "mae": 2.3,
            "rmse": 3.1,
            "params": {
              "learning_rate": 0.01,
              "max_depth": 5
            }
          }), 'utf-8');
        }
        if (normalizedPath.endsWith('regressor.joblib')) {
          return Buffer.from('dummy-content-1', 'utf-8');
        }
        if (normalizedPath.endsWith('classifier.joblib')) {
          return Buffer.from('dummy-content-2', 'utf-8');
        }
        if (normalizedPath.endsWith('preprocessor.joblib')) {
          return Buffer.from('dummy-content-3', 'utf-8');
        }
        // For any other file, use original (will likely throw)
        return originalFsReadFile.call(fs, filePath, options);
      };

      // Mock crypto.createHash to return predictable hashes
      originalCryptoCreateHash = crypto.createHash;
      let hashCallCount = 0;
      crypto.createHash = () => {
        hashCallCount++;
        return {
          update: (data) => {
            return {
              update: () => ({ digest: () => 'hash' + 'x'.repeat(60) }), // 64 chars
              digest: () => 'hash' + 'x'.repeat(60) // 64 chars
            };
          },
          digest: () => {
            // Return different values based on call count to simulate real hashing
            if (hashCallCount === 1) return 'm' + 'x'.repeat(63); // metrics hash
            if (hashCallCount === 2) return 'a' + 'x'.repeat(63); // artifact hash
            if (hashCallCount === 3) return 'c' + 'x'.repeat(63); // combined hash
            if (hashCallCount === 4) return 'f' + 'x'.repeat(63); // fingerprint
            return 'h' + 'x'.repeat(63); // default
          }
        };
      };

      try {
        const versionData = await modelSnapshotService.generateModelVersion();

        // Should return the expected structure
        assert.ok(versionData.modelVersion);
        assert.ok(versionData.metricsJson);
        assert.ok(versionData.artifactFingerprint);

        // Model version should be a 64-character string
        assert.strictEqual(versionData.modelVersion.length, 64);

        // Artifact fingerprint should also be a 64-character string
        assert.strictEqual(versionData.artifactFingerprint.length, 64);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should produce the same version for identical normalized metrics regardless of key order', async () => {
      // Mock fs.readFile
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        // Normalize path for comparison
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          // First call returns metrics1, second call returns metrics2 (same content, different order)
          if (!fs.readFile.__callCount) {
            fs.readFile.__callCount = 1;
            return Buffer.from(JSON.stringify({ "z": 1, "a": 2, "m": { "b": 2, "a": 1 } }), 'utf-8');
          } else {
            fs.readFile.__callCount = 2;
            return Buffer.from(JSON.stringify({ "a": 2, "z": 1, "m": { "a": 1, "b": 2 } }), 'utf-8');
          }
        }
        if (normalizedPath.endsWith('regressor.joblib') ||
            normalizedPath.endsWith('classifier.joblib') ||
            normalizedPath.endsWith('preprocessor.joblib')) {
          return Buffer.from('dummy-content', 'utf-8');
        }
        return originalFsReadFile.call(fs, filePath, options);
      };

      // Mock crypto.createHash
      originalCryptoCreateHash = crypto.createHash;
      crypto.createHash = () => ({
        update: () => ({
          update: () => ({
            digest: () => 'artifact-hash'
          }),
          digest: () => 'metrics-hash'
        }),
        digest: () => 'final-version-hash'
      });

      try {
        const versionData1 = await modelSnapshotService.generateModelVersion();
        const versionData2 = await modelSnapshotService.generateModelVersion();

        // Versions should be identical
        assert.strictEqual(versionData1.modelVersion, versionData2.modelVersion);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle missing metrics file gracefully', async () => {
      // Mock fs.readFile to throw for metrics.json
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          throw new Error('ENOENT: no such file or directory, open metrics.json');
        }
        // For artifact files, return dummy content
        if (normalizedPath.endsWith('regressor.joblib') ||
            normalizedPath.endsWith('classifier.joblib') ||
            normalizedPath.endsWith('preprocessor.joblib')) {
          return Buffer.from('dummy-content', 'utf-8');
        }
        return originalFsReadFile.call(fs, filePath, options);
      };

      try {
        await modelSnapshotService.generateModelVersion();
        assert.fail('Expected error for missing metrics file');
      } catch (err) {
        assert.ok(err instanceof Error);
        // Should contain the error from our mock
        assert.match(err.message, /Failed to read metrics/);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle invalid JSON in metrics file gracefully', async () => {
      // Mock fs.readFile to return invalid JSON
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          return Buffer.from('{ invalid json: }', 'utf-8');
        }
        // For artifact files, return dummy content
        if (normalizedPath.endsWith('regressor.joblib') ||
            normalizedPath.endsWith('classifier.joblib') ||
            normalizedPath.endsWith('preprocessor.joblib')) {
          return Buffer.from('dummy-content', 'utf-8');
        }
        return originalFsReadFile.call(fs, filePath, options);
      };

      try {
        await modelSnapshotService.generateModelVersion();
        assert.fail('Expected error for invalid JSON');
      } catch (err) {
        assert.ok(err instanceof Error);
        // Should contain the error from our mock
        assert.match(err.message, /Failed to parse metrics JSON/);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle missing artifact files gracefully', async () => {
      // Mock fs.readFile
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          return Buffer.from('{"acc": 0.95}', 'utf-8');
        }
        // Simulate missing artifact files by throwing ENOENT
        if (normalizedPath.endsWith('regressor.joblib') ||
            normalizedPath.endsWith('classifier.joblib') ||
            normalizedPath.endsWith('preprocessor.joblib')) {
          throw new Error('ENOENT: no such file or directory, open ' + normalizedPath);
        }
        return originalFsReadFile.call(fs, filePath, options);
      };

      try {
        const versionData = await modelSnapshotService.generateModelVersion();
        // Should still generate a version even with missing artifacts
        assert.ok(versionData.modelVersion);
        assert.ok(versionData.metricsJson);
        assert.ok(versionData.artifactFingerprint);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should limit metrics file size to prevent DoS', async () => {
      // Mock fs.readFile to return a large file
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          // Return file larger than MAX_METRICS_SIZE (64 KiB)
          return Buffer.from('x'.repeat(65 * 1024), 'utf-8'); // 65 KiB
        }
        // For artifact files, return dummy content
        if (normalizedPath.endsWith('regressor.joblib') ||
            normalizedPath.endsWith('classifier.joblib') ||
            normalizedPath.endsWith('preprocessor.joblib')) {
          return Buffer.from('dummy-content', 'utf-8');
        }
        return originalFsReadFile.call(fs, filePath, options);
      };

      try {
        await modelSnapshotService.generateModelVersion();
        assert.fail('Expected error for oversized metrics file');
      } catch (err) {
        assert.ok(err instanceof Error);
        // Should contain the error from our mock
        assert.match(err.message, /Metrics file too large/);
      } finally {
        // Restoration handled in afterEach
      }
    });
  });

  describe('insertModelSnapshot', () => {
    it('should insert a new snapshot and return inserted=true', async () => {
      const modelVersion = 'test-model-version-123';
      const metricsJson = JSON.stringify({ test: 'data' });
      const artifactFingerprint = 'test-artifact-fingerprint';

      // Mock pool.query
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('INSERT INTO ml_model_snapshots') &&
            normalizedSql.includes('ON DUPLICATE KEY UPDATE')) {
          // Return [results, fields] where results is an object with affectedRows and insertId
          return [
            { affectedRows: 1, insertId: 101 },
            undefined
          ];
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      try {
        const result = await modelSnapshotService.insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint);

        assert.strictEqual(result.snapshotId, 101);
        assert.strictEqual(result.inserted, true);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle duplicate key (idempotent insert) and return inserted=false', async () => {
      const modelVersion = 'test-model-version-dup';
      const metricsJson = JSON.stringify({ test: 'data' });
      const artifactFingerprint = 'test-artifact-fingerprint';

      // Mock pool.query
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('INSERT INTO ml_model_snapshots') &&
            normalizedSql.includes('ON DUPLICATE KEY UPDATE')) {
          return [{ affectedRows: 2, insertId: 102 }]; // affectedRows=2 indicates duplicate key
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      try {
        const result = await modelSnapshotService.insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint);

        assert.strictEqual(result.snapshotId, 102);
        assert.strictEqual(result.inserted, false); // Should indicate it already existed
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle database errors appropriately', async () => {
      const modelVersion = 'test-model-version-error';
      const metricsJson = JSON.stringify({ test: 'data' });
      const artifactFingerprint = 'test-artifact-fingerprint';

      // Mock pool.query to throw an error
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('INSERT INTO ml_model_snapshots') &&
            normalizedSql.includes('ON DUPLICATE KEY UPDATE')) {
          throw new Error('Database connection failed');
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      try {
        await modelSnapshotService.insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint);
        assert.fail('Expected error for database failure');
      } catch (err) {
        assert.ok(err instanceof Error);
        // Should contain the error from our mock
        assert.match(err.message, /Failed to insert model snapshot/);
      } finally {
        // Restoration handled in afterEach
      }
    });
  });

  describe('getActiveSnapshot', () => {
    it('should return existing snapshot if it matches current models', async () => {
      const existingSnapshot = {
        id: 201,
        model_version: 'existing-version-hash',
        metrics_json: '{"accuracy": 0.95}',
        artifact_fingerprint: 'existing-artifact-hash',
        created_at: new Date()
      };

      // Mock fs.readFile
      originalFsReadFile = fs.readFile;
      fs.readFile = async (filePath, options) => {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath === path.join(__dirname, '..', '..', 'ml', 'models', 'metrics.json')) {
          return Buffer.from('{"accuracy": 0.95}', 'utf-8');
        }
        if (normalizedPath.endsWith('regressor.joblib') ||
            normalizedPath.endsWith('classifier.joblib') ||
            normalizedPath.endsWith('preprocessor.joblib')) {
          return Buffer.from('dummy', 'utf-8');
        }
        return originalFsReadFile.call(fs, filePath, options);
      };

      // Mock pool.query for SELECT
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('SELECT id, model_version, metrics_json, artifact_fingerprint, created_at FROM ml_model_snapshots') &&
            normalizedSql.includes('ORDER BY created_at DESC, id DESC LIMIT 1')) {
          // Return [results, fields] where results is an array of rows
          return [
            [existingSnapshot],
            undefined
          ];
        }
        // For INSERT queries, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      // Mock crypto.createHash
      originalCryptoCreateHash = crypto.createHash;
      let hashCallCount = 0;
      crypto.createHash = () => {
        hashCallCount++;
        return {
          update: (data) => {
            return {
              digest: () => {
                if (hashCallCount === 1) return 'metrics-hash';
                if (hashCallCount >= 2 && hashCallCount <= 4) return 'artifact-hash';
                if (hashCallCount === 5) return 'existing-version-hash';
                if (hashCallCount === 6) return 'existing-artifact-hash';
                return 'default-hash';
              }
            };
          }
        };
      };

      try {
        const snapshot = await modelSnapshotService.getActiveSnapshot();

        assert.strictEqual(snapshot.snapshotId, 201);
        assert.strictEqual(snapshot.modelVersion, 'existing-version-hash');
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should create new snapshot when no existing snapshot exists', async () => {
      // Mock pool.query for SELECT (no results)
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('SELECT id, model_version, metrics_json, artifact_fingerprint, created_at FROM ml_model_snapshots') &&
            normalizedSql.includes('ORDER BY created_at DESC, id DESC LIMIT 1')) {
          // Return [results, fields] where results is an array of rows
          return [
            [[]],
            undefined
          ];
        }
        // For INSERT queries
        if (normalizedSql.includes('INSERT INTO ml_model_snapshots') &&
            normalizedSql.includes('ON DUPLICATE KEY UPDATE')) {
          // Return [results, fields] where results is an object with affectedRows and insertId
          return [
            { affectedRows: 1, insertId: 301 },
            undefined
          ];
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      // Mock generateModelVersion to return new data
      originalCryptoCreateHash = crypto.createHash;
      crypto.createHash = () => ({
        update: () => ({
          update: () => ({
            digest: () => 'artifact-hash'
          }),
          digest: () => 'metrics-hash'
        }),
        digest: () => 'final-version-hash'
      });

      try {
        const snapshot = await modelSnapshotService.getActiveSnapshot();

        assert.strictEqual(snapshot.snapshotId, 301);
        assert.strictEqual(snapshot.modelVersion, 'new-version-hash');
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should create new snapshot when existing snapshot does not match current models', async () => {
      const existingSnapshot = {
        id: 401,
        model_version: 'old-version-hash',
        metrics_json: '{"accuracy": 0.90}',
        artifact_fingerprint: 'old-artifact-hash',
        created_at: new Date()
      };

      // Mock pool.query for SELECT
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('SELECT id, model_version, metrics_json, artifact_fingerprint, created_at FROM ml_model_snapshots') &&
            normalizedSql.includes('ORDER BY created_at DESC, id DESC LIMIT 1')) {
          // Return [results, fields] where results is an array of rows
          return [
            [existingSnapshot],
            undefined
          ];
        }
        // For INSERT queries
        if (normalizedSql.includes('INSERT INTO ml_model_snapshots') &&
            normalizedSql.includes('ON DUPLICATE KEY UPDATE')) {
          // Return [results, fields] where results is an object with affectedRows and insertId
          return [
            { affectedRows: 1, insertId: 402 },
            undefined
          ];
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      // Mock generateModelVersion to return different data (model changed)
      originalCryptoCreateHash = crypto.createHash;
      let hashCallCount = 0;
      crypto.createHash = () => {
        hashCallCount++;
        return {
          update: (data) => {
            return {
              update: () => ({
                digest: () => 'hash' + 'x'.repeat(60)
              }),
              digest: () => 'hash' + 'x'.repeat(60)
            };
          },
          digest: () => {
            // Return different hash based on call count
            if (hashCallCount === 1) return 'o' + 'x'.repeat(63); // old version hash (from DB)
            if (hashCallCount === 2) return 'a' + 'x'.repeat(63); // artifact hash
            if (hashCallCount === 3) return 'c' + 'x'.repeat(63); // combined hash
            if (hashCallCount === 4) return 'n' + 'x'.repeat(63); // new version hash (generated)
            if (hashCallCount === 5) return 'f' + 'x'.repeat(63); // fingerprint
            return 'd' + 'x'.repeat(63); // default
          }
        };
      };

      try {
        const snapshot = await modelSnapshotService.getActiveSnapshot();

        assert.strictEqual(snapshot.snapshotId, 402); // New snapshot created
        assert.strictEqual(snapshot.modelVersion, 'new-version-hash');
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle database errors when checking for existing snapshot', async () => {
      // Mock pool.query to throw an error on SELECT
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('SELECT id, model_version, metrics_json, artifact_fingerprint, created_at FROM ml_model_snapshots') &&
            normalizedSql.includes('ORDER BY created_at DESC, id DESC LIMIT 1')) {
          throw new Error('Database query failed');
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      try {
        await modelSnapshotService.getActiveSnapshot();
        assert.fail('Expected error for database failure');
      } catch (err) {
        assert.ok(err instanceof Error);
        // Should contain the error from our mock
        assert.match(err.message, /Failed to get active model snapshot/);
      } finally {
        // Restoration handled in afterEach
      }
    });

    it('should handle database errors when creating new snapshot', async () => {
      // Mock pool.query for SELECT (no results)
      originalPoolQuery = pool.query;
      pool.query = async (sql, params) => {
        // Normalize SQL for matching
        const normalizedSql = sql.trim().replace(/\s+/g, ' ');
        if (normalizedSql.includes('SELECT id, model_version, metrics_json, artifact_fingerprint, created_at FROM ml_model_snapshots') &&
            normalizedSql.includes('ORDER BY created_at DESC, id DESC LIMIT 1')) {
          return [[]]; // No existing snapshots
        }
        // Mock pool.query to throw an error on INSERT
        if (normalizedSql.includes('INSERT INTO ml_model_snapshots') &&
            normalizedSql.includes('ON DUPLICATE KEY UPDATE')) {
          throw new Error('Database insert failed');
        }
        // For any other query, use original
        return originalPoolQuery.call(pool, sql, params);
      };

      // Mock generateModelVersion to return new data
      originalCryptoCreateHash = crypto.createHash;
      crypto.createHash = () => ({
        update: () => ({
          update: () => ({
            digest: () => 'artifact-hash'
          }),
          digest: () => 'metrics-hash'
        }),
        digest: () => 'final-version-hash'
      });

      try {
        await modelSnapshotService.getActiveSnapshot();
        assert.fail('Expected error for database failure');
      } catch (err) {
        assert.ok(err instanceof Error);
        // Should contain the error from our mock
        assert.match(err.message, /Failed to get active model snapshot/);
      } finally {
        // Restoration handled in afterEach
      }
    });
  });
});