'use strict';

const { pool } = require('../config/db');
const modelSnapshotService = require('./modelSnapshotService');
const predictionHistoryService = require('./predictionHistoryService');

const METHOD = 'absolute_standardized_mean_shift';
const EPSILON = 1e-9;
const MINIMUM_SAMPLE_SIZE = 30;
const STABLE_THRESHOLD = 0.25;
const DRIFTED_THRESHOLD = 0.5;
const INCLUDED_PREDICTION_KINDS = Object.freeze(['prediction']);
const EXCLUDED_PREDICTION_KINDS = Object.freeze([
  'feedback',
  'baseline',
  'simulation',
]);
const DRIFT_FILTER_FIELDS = new Set(['from', 'to', 'modelVersion']);
const FEATURE_COLUMNS = Object.freeze({
  study_hours: 'study_hours',
  attendance_percent: 'attendance_percent',
  sleep_hours: 'sleep_hours',
  previous_gpa: 'previous_gpa',
});
const THRESHOLDS = Object.freeze({
  stableBelow: STABLE_THRESHOLD,
  driftedAtOrAbove: DRIFTED_THRESHOLD,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDriftFilters(options = {}, now = new Date()) {
  if (!isPlainObject(options)) throw new TypeError('Drift filters must be an object');
  for (const key of Object.keys(options)) {
    if (!DRIFT_FILTER_FIELDS.has(key)) {
      throw new RangeError(`Unknown drift filter field: ${key}`);
    }
  }
  const historyFilters = predictionHistoryService.normalizeHistoryFilters(
    {
      ...(options.from === undefined ? {} : { from: options.from }),
      ...(options.to === undefined ? {} : { to: options.to }),
      ...(options.modelVersion === undefined
        ? {}
        : { modelVersion: options.modelVersion }),
    },
    now
  );
  return {
    from: historyFilters.from,
    to: historyFilters.to,
    modelVersion: historyFilters.modelVersion,
  };
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function countOrZero(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function insufficientFeature(feature, baselineStats, currentStats) {
  return {
    feature,
    status: 'insufficient_data',
    method: METHOD,
    baselineSampleCount: Number.isSafeInteger(baselineStats?.sampleCount)
      ? baselineStats.sampleCount
      : null,
    currentSampleCount: countOrZero(currentStats?.sampleCount),
    baselineMean: finiteNumberOrNull(baselineStats?.mean),
    currentMean: finiteNumberOrNull(currentStats?.mean),
    baselineStandardDeviation: finiteNumberOrNull(
      baselineStats?.standardDeviation
    ),
    standardizedMeanShift: null,
    thresholds: THRESHOLDS,
  };
}

function calculateFeatureDrift(feature, baselineStats, currentStats) {
  if (
    !isPlainObject(baselineStats) ||
    !Number.isSafeInteger(baselineStats.sampleCount) ||
    baselineStats.sampleCount <= 0 ||
    !Number.isFinite(baselineStats.mean) ||
    !Number.isFinite(baselineStats.standardDeviation) ||
    baselineStats.standardDeviation < 0 ||
    !isPlainObject(currentStats) ||
    !Number.isSafeInteger(currentStats.sampleCount) ||
    currentStats.sampleCount < MINIMUM_SAMPLE_SIZE ||
    !Number.isFinite(currentStats.mean)
  ) {
    return insufficientFeature(feature, baselineStats, currentStats);
  }

  const denominator = Math.max(baselineStats.standardDeviation, EPSILON);
  const shift = Math.abs(currentStats.mean - baselineStats.mean) / denominator;
  if (!Number.isFinite(shift)) {
    return insufficientFeature(feature, baselineStats, currentStats);
  }

  let status = 'stable';
  if (shift >= DRIFTED_THRESHOLD) status = 'drifted';
  else if (shift >= STABLE_THRESHOLD) status = 'warning';

  return {
    feature,
    status,
    method: METHOD,
    baselineSampleCount: baselineStats.sampleCount,
    currentSampleCount: currentStats.sampleCount,
    baselineMean: baselineStats.mean,
    currentMean: currentStats.mean,
    baselineStandardDeviation: baselineStats.standardDeviation,
    standardizedMeanShift: shift,
    thresholds: THRESHOLDS,
  };
}

function calculateDrift(driftBaseline, currentStatistics = {}) {
  const features = Object.keys(FEATURE_COLUMNS).map((feature) => (
    calculateFeatureDrift(
      feature,
      driftBaseline?.[feature],
      currentStatistics?.[feature]
    )
  ));
  const validStatuses = features
    .map((feature) => feature.status)
    .filter((status) => status !== 'insufficient_data');

  let overallStatus = 'insufficient_data';
  if (validStatuses.includes('drifted')) overallStatus = 'drifted';
  else if (validStatuses.includes('warning')) overallStatus = 'warning';
  else if (validStatuses.includes('stable')) overallStatus = 'stable';

  return { overallStatus, features };
}

function currentStatisticsFromRow(row = {}) {
  const statistics = {};
  for (const feature of Object.keys(FEATURE_COLUMNS)) {
    statistics[feature] = {
      sampleCount: countOrZero(row[`${feature}_count`]),
      mean: finiteNumberOrNull(row[`${feature}_mean`]),
    };
  }
  return statistics;
}

async function getDriftReport(options = {}) {
  const filters = normalizeDriftFilters(options);
  const snapshot = await modelSnapshotService.getModelSnapshot(
    filters.modelVersion === null ? undefined : filters.modelVersion
  );
  if (!snapshot) return null;

  let currentStatistics = {};
  if (snapshot.driftBaseline !== null) {
    const aggregateFields = Object.entries(FEATURE_COLUMNS)
      .flatMap(([feature, column]) => [
        `COUNT(e.${column}) AS ${feature}_count`,
        `AVG(e.${column}) AS ${feature}_mean`,
      ])
      .join(',\n      ');
    const [rows] = await pool.query(
      `
      SELECT
        ${aggregateFields}
      FROM ml_prediction_events e
      WHERE e.model_snapshot_id = ?
        AND e.created_at >= ?
        AND e.created_at <= ?
        AND e.prediction_kind = ?
      `,
      [
        snapshot.snapshotId,
        filters.from,
        filters.to,
        INCLUDED_PREDICTION_KINDS[0],
      ]
    );
    currentStatistics = currentStatisticsFromRow(rows[0]);
  }

  const drift = calculateDrift(snapshot.driftBaseline, currentStatistics);
  return {
    modelVersion: snapshot.modelVersion,
    window: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
    },
    method: METHOD,
    minimumSampleSize: MINIMUM_SAMPLE_SIZE,
    overallStatus: drift.overallStatus,
    features: drift.features,
  };
}

module.exports = {
  DRIFTED_THRESHOLD,
  EPSILON,
  EXCLUDED_PREDICTION_KINDS,
  INCLUDED_PREDICTION_KINDS,
  METHOD,
  MINIMUM_SAMPLE_SIZE,
  STABLE_THRESHOLD,
  THRESHOLDS,
  calculateDrift,
  calculateFeatureDrift,
  currentStatisticsFromRow,
  getDriftReport,
  normalizeDriftFilters,
};
