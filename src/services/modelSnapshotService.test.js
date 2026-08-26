'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../config/db');
const service = require('./modelSnapshotService');

const originalReadFile = fs.readFile;
const originalQuery = pool.query;
const ARTIFACT_CONTENT = {
  'regressor.joblib': 'regressor-v1',
  'classifier.joblib': 'classifier-v1',
  'preprocessor.joblib': 'preprocessor-v1',
};

function mockModelFiles({ metrics = { score: 0.9 }, artifacts = ARTIFACT_CONTENT } = {}) {
  fs.readFile = async (filePath) => {
    const filename = path.basename(filePath);
    if (filename === 'metrics.json') {
      return Buffer.isBuffer(metrics)
        ? metrics
        : Buffer.from(typeof metrics === 'string' ? metrics : JSON.stringify(metrics));
    }
    if (Object.prototype.hasOwnProperty.call(artifacts, filename)) {
      const value = artifacts[filename];
      if (value instanceof Error) throw value;
      return Buffer.from(value);
    }
    const err = new Error('missing');
    err.code = 'ENOENT';
    throw err;
  };
}

describe('modelSnapshotService', () => {
  beforeEach(() => {
    mockModelFiles();
    pool.query = originalQuery;
  });

  afterEach(() => {
    fs.readFile = originalReadFile;
    pool.query = originalQuery;
  });

  describe('generateModelVersion', () => {
    it('generates stable SHA-256 values and normalized metrics', async () => {
      mockModelFiles({ metrics: { z: 1, nested: { b: 2, a: 1 }, a: 2 } });
      const first = await service.generateModelVersion();
      mockModelFiles({ metrics: { a: 2, nested: { a: 1, b: 2 }, z: 1 } });
      const second = await service.generateModelVersion();

      assert.equal(first.modelVersion, second.modelVersion);
      assert.equal(first.artifactFingerprint, second.artifactFingerprint);
      assert.equal(first.metricsJson, '{"a":2,"nested":{"a":1,"b":2},"z":1}');
      assert.match(first.modelVersion, /^[a-f0-9]{64}$/);
      assert.match(first.artifactFingerprint, /^[a-f0-9]{64}$/);
    });

    it('changes the version when an artifact changes', async () => {
      const first = await service.generateModelVersion();
      mockModelFiles({
        artifacts: { ...ARTIFACT_CONTENT, 'regressor.joblib': 'regressor-v2' },
      });
      const second = await service.generateModelVersion();

      assert.notEqual(first.modelVersion, second.modelVersion);
      assert.notEqual(first.artifactFingerprint, second.artifactFingerprint);
    });

    it('binds artifact hashes to filenames', async () => {
      const first = await service.generateModelVersion();
      mockModelFiles({
        artifacts: {
          ...ARTIFACT_CONTENT,
          'regressor.joblib': ARTIFACT_CONTENT['classifier.joblib'],
          'classifier.joblib': ARTIFACT_CONTENT['regressor.joblib'],
        },
      });
      const second = await service.generateModelVersion();

      assert.notEqual(first.modelVersion, second.modelVersion);
      assert.notEqual(first.artifactFingerprint, second.artifactFingerprint);
    });

    it('fails explicitly when metrics are missing', async () => {
      fs.readFile = async () => {
        const err = new Error('missing');
        err.code = 'ENOENT';
        throw err;
      };

      await assert.rejects(
        service.generateModelVersion(),
        /Failed to read model metrics \(ENOENT\)/
      );
    });

    it('fails explicitly when a required artifact is missing', async () => {
      mockModelFiles({
        artifacts: {
          ...ARTIFACT_CONTENT,
          'classifier.joblib': new Error('missing'),
        },
      });

      await assert.rejects(
        service.generateModelVersion(),
        /Required model artifact unavailable: classifier\.joblib/
      );
    });

    it('rejects invalid and oversized metrics', async () => {
      mockModelFiles({ metrics: '{invalid' });
      await assert.rejects(service.generateModelVersion(), /Failed to parse/);

      mockModelFiles({ metrics: Buffer.alloc(service.MAX_METRICS_SIZE + 1, 120) });
      await assert.rejects(service.generateModelVersion(), /must not exceed/);
    });

    it('rejects absolute paths in metrics instead of persisting them', async () => {
      mockModelFiles({ metrics: { modelPath: 'C:\\private\\models\\regressor.joblib' } });
      await assert.rejects(service.generateModelVersion(), /must not contain absolute paths/);
    });
  });

  describe('insertModelSnapshot', () => {
    const modelVersion = 'a'.repeat(64);
    const artifactFingerprint = 'b'.repeat(64);
    const metricsJson = '{"accuracy":0.9}';

    it('uses parameterized, concurrency-safe SQL for a new row', async () => {
      let captured;
      pool.query = async (sql, params) => {
        captured = { sql, params };
        return [{ affectedRows: 1, insertId: 21 }];
      };

      const result = await service.insertModelSnapshot(
        modelVersion,
        metricsJson,
        artifactFingerprint
      );

      assert.deepEqual(result, { snapshotId: 21, inserted: true });
      assert.match(captured.sql, /ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID\(id\)/);
      assert.match(captured.sql, /VALUES \(\?, \?, \?\)/);
      assert.deepEqual(captured.params, [modelVersion, metricsJson, artifactFingerprint]);
    });

    it('returns the existing ID for an idempotent duplicate', async () => {
      pool.query = async () => [{ affectedRows: 2, insertId: 22 }];

      const result = await service.insertModelSnapshot(
        modelVersion,
        metricsJson,
        artifactFingerprint
      );

      assert.deepEqual(result, { snapshotId: 22, inserted: false });
    });

    it('handles concurrent duplicate inserts without a read-then-write race', async () => {
      let calls = 0;
      pool.query = async () => {
        calls += 1;
        return [{ affectedRows: calls === 1 ? 1 : 2, insertId: 23 }];
      };

      const results = await Promise.all([
        service.insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint),
        service.insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint),
      ]);

      assert.deepEqual(results.map(result => result.snapshotId), [23, 23]);
      assert.equal(calls, 2);
    });

    it('validates hashes, JSON, and path privacy before SQL', async () => {
      let calls = 0;
      pool.query = async () => {
        calls += 1;
        return [{ affectedRows: 1, insertId: 1 }];
      };

      await assert.rejects(
        service.insertModelSnapshot('invalid', metricsJson, artifactFingerprint),
        /model_version/
      );
      await assert.rejects(
        service.insertModelSnapshot(modelVersion, 'invalid', artifactFingerprint),
        /valid JSON/
      );
      await assert.rejects(
        service.insertModelSnapshot(
          modelVersion,
          JSON.stringify({ path: '/private/model.joblib' }),
          artifactFingerprint
        ),
        /absolute paths/
      );
      await assert.rejects(
        service.insertModelSnapshot(modelVersion, metricsJson, 'invalid'),
        /artifact_fingerprint/
      );
      assert.equal(calls, 0);
    });

    it('propagates unrelated database failures', async () => {
      const databaseError = new Error('connection unavailable');
      pool.query = async () => { throw databaseError; };

      await assert.rejects(
        service.insertModelSnapshot(modelVersion, metricsJson, artifactFingerprint),
        err => err === databaseError
      );
    });
  });

  describe('getActiveSnapshot', () => {
    it('generates once and resolves the ID with one idempotent insert', async () => {
      const reads = new Map();
      fs.readFile = async (filePath) => {
        const filename = path.basename(filePath);
        reads.set(filename, (reads.get(filename) || 0) + 1);
        if (filename === 'metrics.json') return Buffer.from('{"accuracy":0.91}');
        return Buffer.from(ARTIFACT_CONTENT[filename]);
      };
      pool.query = async () => [{ affectedRows: 2, insertId: 31 }];

      const result = await service.getActiveSnapshot();

      assert.equal(result.snapshotId, 31);
      assert.match(result.modelVersion, /^[a-f0-9]{64}$/);
      assert.deepEqual(Object.fromEntries(reads), {
        'metrics.json': 1,
        'regressor.joblib': 1,
        'classifier.joblib': 1,
        'preprocessor.joblib': 1,
      });
    });
  });
});
