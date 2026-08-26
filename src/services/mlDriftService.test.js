'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const modelSnapshotService = require('./modelSnapshotService');
const service = require('./mlDriftService');

const originalQuery = pool.query;
const originalGetModelSnapshot = modelSnapshotService.getModelSnapshot;
const MODEL_VERSION = 'c'.repeat(64);
const baseline = Object.freeze({
  study_hours: { sampleCount: 100, mean: 4, standardDeviation: 2 },
  attendance_percent: { sampleCount: 100, mean: 80, standardDeviation: 10 },
  sleep_hours: { sampleCount: 100, mean: 7, standardDeviation: 1 },
  previous_gpa: { sampleCount: 100, mean: 3, standardDeviation: 0.5 },
});

function current(overrides = {}) {
  return {
    study_hours: { sampleCount: 30, mean: 4 },
    attendance_percent: { sampleCount: 30, mean: 80 },
    sleep_hours: { sampleCount: 30, mean: 7 },
    previous_gpa: { sampleCount: 30, mean: 3 },
    ...overrides,
  };
}

function assertNoNonFiniteNumbers(value) {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoNonFiniteNumbers);
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(assertNoNonFiniteNumbers);
  }
}

describe('mlDriftService', () => {
  beforeEach(() => {
    pool.query = originalQuery;
    modelSnapshotService.getModelSnapshot = originalGetModelSnapshot;
  });

  afterEach(() => {
    pool.query = originalQuery;
    modelSnapshotService.getModelSnapshot = originalGetModelSnapshot;
  });

  it('uses documented thresholds for stable, warning, and drifted shifts', () => {
    const stable = service.calculateFeatureDrift(
      'study_hours',
      { sampleCount: 100, mean: 4, standardDeviation: 2 },
      { sampleCount: 30, mean: 4.49 }
    );
    const warning = service.calculateFeatureDrift(
      'study_hours',
      { sampleCount: 100, mean: 4, standardDeviation: 2 },
      { sampleCount: 30, mean: 4.5 }
    );
    const drifted = service.calculateFeatureDrift(
      'study_hours',
      { sampleCount: 100, mean: 4, standardDeviation: 2 },
      { sampleCount: 30, mean: 5 }
    );

    assert.equal(stable.status, 'stable');
    assert.equal(stable.standardizedMeanShift, 0.2450000000000001);
    assert.equal(warning.status, 'warning');
    assert.equal(warning.standardizedMeanShift, 0.25);
    assert.equal(drifted.status, 'drifted');
    assert.equal(drifted.standardizedMeanShift, 0.5);
  });

  it('returns insufficient data for missing baseline, invalid baseline, too few samples, or missing current values', () => {
    for (const [base, observed] of [
      [null, { sampleCount: 30, mean: 4 }],
      [{ sampleCount: 0, mean: 4, standardDeviation: 1 }, { sampleCount: 30, mean: 4 }],
      [{ sampleCount: 100, mean: 4, standardDeviation: -1 }, { sampleCount: 30, mean: 4 }],
      [{ sampleCount: 100, mean: 4, standardDeviation: 1 }, { sampleCount: 29, mean: 4 }],
      [{ sampleCount: 100, mean: 4, standardDeviation: 1 }, { sampleCount: 30, mean: null }],
    ]) {
      const result = service.calculateFeatureDrift('study_hours', base, observed);
      assert.equal(result.status, 'insufficient_data');
      assert.equal(result.standardizedMeanShift, null);
      assertNoNonFiniteNumbers(result);
    }
  });

  it('uses epsilon for zero deviation without returning NaN or Infinity', () => {
    const same = service.calculateFeatureDrift(
      'study_hours',
      { sampleCount: 100, mean: 4, standardDeviation: 0 },
      { sampleCount: 30, mean: 4 }
    );
    const changed = service.calculateFeatureDrift(
      'study_hours',
      { sampleCount: 100, mean: 4, standardDeviation: 0 },
      { sampleCount: 30, mean: 4.1 }
    );

    assert.equal(same.status, 'stable');
    assert.equal(same.standardizedMeanShift, 0);
    assert.equal(changed.status, 'drifted');
    assert.equal(Number.isFinite(changed.standardizedMeanShift), true);
    assertNoNonFiniteNumbers(changed);
  });

  it('chooses the most severe valid feature while preserving insufficient features', () => {
    const report = service.calculateDrift(baseline, current({
      study_hours: { sampleCount: 30, mean: 4.6 },
      attendance_percent: { sampleCount: 30, mean: 84 },
      sleep_hours: { sampleCount: 10, mean: 9 },
    }));

    assert.equal(report.overallStatus, 'warning');
    assert.equal(
      report.features.find((feature) => feature.feature === 'sleep_hours').status,
      'insufficient_data'
    );

    const drifted = service.calculateDrift(baseline, current({
      previous_gpa: { sampleCount: 30, mean: 3.3 },
    }));
    assert.equal(drifted.overallStatus, 'drifted');

    const unavailable = service.calculateDrift(null, {});
    assert.equal(unavailable.overallStatus, 'insufficient_data');
    assert.equal(unavailable.features.every((feature) => (
      feature.status === 'insufficient_data'
    )), true);
    assertNoNonFiniteNumbers(unavailable);
    assert.doesNotMatch(JSON.stringify(unavailable), /NaN|Infinity/);
  });

  it('normalizes database aggregate strings and missing values safely', () => {
    const statistics = service.currentStatisticsFromRow({
      study_hours_count: '31',
      study_hours_mean: '4.25',
      attendance_percent_count: 'invalid',
      attendance_percent_mean: null,
      sleep_hours_count: 30,
      sleep_hours_mean: 'Infinity',
    });

    assert.deepEqual(statistics.study_hours, { sampleCount: 31, mean: 4.25 });
    assert.deepEqual(statistics.attendance_percent, { sampleCount: 0, mean: null });
    assert.deepEqual(statistics.sleep_hours, { sampleCount: 30, mean: null });
    assert.deepEqual(statistics.previous_gpa, { sampleCount: 0, mean: null });
  });

  it('aggregates one snapshot and only real prediction events inside the bounded window', async () => {
    let selectedVersion;
    let captured;
    modelSnapshotService.getModelSnapshot = async (modelVersion) => {
      selectedVersion = modelVersion;
      return {
        snapshotId: 77,
        modelVersion: MODEL_VERSION,
        driftBaseline: baseline,
      };
    };
    pool.query = async (sql, params) => {
      captured = { sql, params };
      return [[{
        study_hours_count: '35',
        study_hours_mean: '4.2',
        attendance_percent_count: '35',
        attendance_percent_mean: '81',
        sleep_hours_count: '35',
        sleep_hours_mean: '7.1',
        previous_gpa_count: '35',
        previous_gpa_mean: '3.1',
      }]];
    };

    const report = await service.getDriftReport({
      from: '2026-08-01',
      to: '2026-08-25',
      modelVersion: MODEL_VERSION,
    });

    assert.equal(selectedVersion, MODEL_VERSION);
    assert.match(captured.sql, /e\.model_snapshot_id = \?/);
    assert.match(captured.sql, /e\.prediction_kind = \?/);
    assert.doesNotMatch(captured.sql, /JOIN ml_model_snapshots/);
    assert.equal(captured.params[0], 77);
    assert.equal(captured.params[3], 'prediction');
    assert.equal(captured.params.includes('simulation'), false);
    assert.equal(captured.params.includes('baseline'), false);
    assert.equal(captured.params.includes('feedback'), false);
    assert.equal(report.modelVersion, MODEL_VERSION);
    assert.equal(report.minimumSampleSize, 30);
    assert.equal(report.method, service.METHOD);
    assertNoNonFiniteNumbers(report);
  });

  it('skips event aggregation when a snapshot has no usable baseline', async () => {
    let queries = 0;
    modelSnapshotService.getModelSnapshot = async () => ({
      snapshotId: 78,
      modelVersion: MODEL_VERSION,
      driftBaseline: null,
    });
    pool.query = async () => {
      queries += 1;
      throw new Error('must not query');
    };

    const report = await service.getDriftReport({
      from: '2026-08-01',
      to: '2026-08-25',
    });

    assert.equal(queries, 0);
    assert.equal(report.overallStatus, 'insufficient_data');
  });

  it('returns null for an unavailable selected model and exposes explicit kind policy', async () => {
    modelSnapshotService.getModelSnapshot = async () => null;

    assert.equal(await service.getDriftReport({ modelVersion: MODEL_VERSION }), null);
    assert.deepEqual(service.INCLUDED_PREDICTION_KINDS, ['prediction']);
    assert.deepEqual(service.EXCLUDED_PREDICTION_KINDS, [
      'feedback',
      'baseline',
      'simulation',
    ]);
  });

  it('rejects unknown and invalid drift filters before selecting a model', () => {
    assert.throws(() => service.normalizeDriftFilters({ kind: 'simulation' }), /Unknown/);
    assert.throws(() => service.normalizeDriftFilters({ modelVersion: 'bad' }), /modelVersion/);
    assert.throws(
      () => service.normalizeDriftFilters({ from: '2026-08-02', to: '2026-08-01' }),
      /from must not be later/
    );
  });
});
