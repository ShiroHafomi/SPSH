'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const service = require('./modelSnapshotService');

const originalQuery = pool.query;
const MODEL_VERSION = 'a'.repeat(64);
const validBaseline = Object.freeze({
  study_hours: {
    sample_count: 100,
    mean: 4,
    standard_deviation: 1.5,
    minimum: 0,
    maximum: 12,
  },
  attendance_percent: {
    sample_count: 100,
    mean: 85,
    standard_deviation: 8,
    minimum: 40,
    maximum: 100,
  },
  sleep_hours: {
    sample_count: 100,
    mean: 7,
    standard_deviation: 1,
    minimum: 3,
    maximum: 12,
  },
  previous_gpa: {
    sample_count: 100,
    mean: 3,
    standard_deviation: 0.5,
    minimum: 1,
    maximum: 4,
  },
});

function metricsWithBaseline(baseline = validBaseline) {
  return { accuracy: 0.9, drift_baseline: baseline };
}

describe('modelSnapshotService Phase 2 drift baseline', () => {
  beforeEach(() => {
    pool.query = originalQuery;
  });

  afterEach(() => {
    pool.query = originalQuery;
  });

  it('parses allowlisted aggregate statistics without retaining training rows', () => {
    const parsed = service.parseDriftBaseline(metricsWithBaseline());

    assert.deepEqual(parsed.study_hours, {
      sampleCount: 100,
      mean: 4,
      standardDeviation: 1.5,
      minimum: 0,
      maximum: 12,
    });
    assert.equal(Object.hasOwn(parsed.study_hours, 'rows'), false);
    assert.equal(Object.hasOwn(parsed.study_hours, 'studentId'), false);
  });

  it('accepts JSON strings and buffers and treats an absent baseline as unavailable', () => {
    const metrics = metricsWithBaseline();
    assert.deepEqual(
      service.parseDriftBaseline(JSON.stringify(metrics)),
      service.parseDriftBaseline(Buffer.from(JSON.stringify(metrics)))
    );
    assert.equal(service.parseDriftBaseline({ accuracy: 0.9 }), null);
  });

  it('rejects unknown features, unknown statistics, and oversized baselines', () => {
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        ...validBaseline,
        email: validBaseline.study_hours,
      })),
      /Unknown drift baseline feature/
    );
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        study_hours: { ...validBaseline.study_hours, median: 4 },
      })),
      /Unknown drift baseline statistic/
    );
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        study_hours: {
          ...validBaseline.study_hours,
          padding: 'x'.repeat(service.MAX_DRIFT_BASELINE_SIZE),
        },
      })),
      /must not exceed/
    );
  });

  it('rejects invalid counts, non-finite values, negative deviation, and reversed bounds', () => {
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        study_hours: { ...validBaseline.study_hours, sample_count: -1 },
      })),
      /sample_count/
    );
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        study_hours: { ...validBaseline.study_hours, mean: Number.NaN },
      })),
      /mean must be finite/
    );
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        study_hours: { ...validBaseline.study_hours, standard_deviation: -0.1 },
      })),
      /cannot be negative/
    );
    assert.throws(
      () => service.parseDriftBaseline(metricsWithBaseline({
        study_hours: { ...validBaseline.study_hours, minimum: 10, maximum: 5 },
      })),
      /cannot exceed maximum/
    );
  });

  it('selects a requested model with a parameter and returns its parsed baseline', async () => {
    let captured;
    pool.query = async (sql, params) => {
      captured = { sql, params };
      return [[{
        id: 17,
        model_version: MODEL_VERSION,
        metrics_json: JSON.stringify(metricsWithBaseline()),
        created_at: new Date('2026-08-20T10:00:00.000Z'),
      }]];
    };

    const snapshot = await service.getModelSnapshot(MODEL_VERSION);

    assert.deepEqual(captured.params, [MODEL_VERSION]);
    assert.match(captured.sql, /WHERE model_version = \?/);
    assert.match(captured.sql, /ORDER BY created_at DESC, id DESC/);
    assert.equal(snapshot.snapshotId, 17);
    assert.equal(snapshot.driftBaseline.study_hours.mean, 4);
  });

  it('selects the deterministic latest snapshot and safely marks malformed stored baselines unavailable', async () => {
    let captured;
    pool.query = async (sql, params) => {
      captured = { sql, params };
      return [[{
        id: 18,
        model_version: MODEL_VERSION,
        metrics_json: JSON.stringify({ drift_baseline: { unknown: {} } }),
        created_at: new Date('2026-08-21T10:00:00.000Z'),
      }]];
    };

    const snapshot = await service.getModelSnapshot();

    assert.deepEqual(captured.params, []);
    assert.doesNotMatch(captured.sql, /WHERE model_version/);
    assert.equal(snapshot.driftBaseline, null);
  });

  it('returns null for an unavailable snapshot and rejects invalid version hashes before SQL', async () => {
    let calls = 0;
    pool.query = async () => {
      calls += 1;
      return [[]];
    };

    assert.equal(await service.getModelSnapshot(MODEL_VERSION), null);
    await assert.rejects(service.getModelSnapshot('invalid'), /modelVersion/);
    assert.equal(calls, 1);
  });
});
