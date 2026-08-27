import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_VALUE,
  buildCurrentPageCharts,
  createDefaultFilters,
  derivePageSummary,
  finiteNumber,
  formatChartDateLabels,
  formatDate,
  formatDateTime,
  formatLatency,
  formatPercentage,
  formatPositiveInteger,
  getDriftStatusPresentation,
  getPredictionKindPresentation,
  isProductionKind,
  normalizePagination,
  serializeHistoryFilters,
  shortenModelVersion,
  sortHistoryChronologically,
  validateDateRange,
} from './mlMonitoring.js';

const MODEL_VERSION = 'a'.repeat(64);
const colors = {
  prediction: { bg: '#1a', border: '#1' },
  feedback: { bg: '#2a', border: '#2' },
  baseline: { bg: '#3a', border: '#3' },
  simulation: { bg: '#4a', border: '#4' },
};
const labels = {
  prediction: 'Production',
  feedback: 'Feedback',
  baseline: 'Baseline',
  simulation: 'Simulation',
};

const rows = [
  { id: 3, createdAt: '2026-08-03T10:00:00Z', predictionKind: 'simulation', predictedGrade: 'B', gradeConfidence: 0.8, inferenceLatencyMs: 30 },
  { id: 1, createdAt: '2026-08-01T10:00:00Z', predictionKind: 'prediction', predictedGrade: 'A', gradeConfidence: 0.9, inferenceLatencyMs: 10 },
  { id: 2, createdAt: '2026-08-02T10:00:00Z', predictionKind: 'prediction', predictedGrade: 'A', gradeConfidence: 0.7, inferenceLatencyMs: 20 },
];

test('safe numeric formatters never expose non-finite values', () => {
  assert.equal(finiteNumber('12.5'), 12.5);
  assert.equal(finiteNumber(Infinity), null);
  assert.equal(finiteNumber(true), null);
  assert.equal(finiteNumber([]), null);
  assert.equal(formatPercentage(null), EMPTY_VALUE);
  assert.equal(formatPercentage(Number.NaN), EMPTY_VALUE);
  assert.equal(formatPercentage(0.875, 'en-US'), '87.5%');
  assert.equal(formatPercentage(-0.1), EMPTY_VALUE);
  assert.equal(formatPercentage(1.1), EMPTY_VALUE);
  assert.equal(formatLatency(Infinity), EMPTY_VALUE);
  assert.equal(formatLatency(34.4, 'en-US'), '34 ms');
  assert.equal(formatDate(null), EMPTY_VALUE);
  assert.equal(formatDate('2026-08-26T23:59:59.999Z', 'en-US'), 'Aug 26, 2026');
  assert.equal(formatDateTime(''), EMPTY_VALUE);
  assert.equal(formatDateTime('2026-02-30T10:00:00Z'), EMPTY_VALUE);
  assert.equal(formatDateTime('2026-08-01T23:30:00Z', 'en-US'), 'Aug 1, 2026, 11:30 PM');
  assert.equal(formatPositiveInteger('42', 'en-US'), '42');
  assert.equal(formatPositiveInteger(1.5), EMPTY_VALUE);
  assert.equal(formatPositiveInteger(-1), EMPTY_VALUE);
  assert.equal(formatPositiveInteger(true), EMPTY_VALUE);
});

test('prediction kind and drift status mappings are allowlisted', () => {
  assert.equal(getPredictionKindPresentation('prediction').labelKey, 'mlMonitoring.kinds.prediction');
  assert.equal(getPredictionKindPresentation('hostile').labelKey, 'mlMonitoring.kinds.unknown');
  assert.equal(getDriftStatusPresentation('drifted').variant, 'danger');
  assert.equal(getDriftStatusPresentation('healthy').labelKey, 'mlMonitoring.status.insufficientData');
});

test('production and preview kinds remain explicitly distinct', () => {
  assert.equal(isProductionKind('prediction'), true);
  assert.equal(isProductionKind('feedback'), false);
  assert.equal(isProductionKind('baseline'), false);
  assert.equal(isProductionKind('simulation'), false);
});

test('history serialization emits only supported validated filters', () => {
  const query = new URLSearchParams(serializeHistoryFilters({
    page: '2',
    size: '100',
    from: '2026-08-01',
    to: '2026-08-26',
    kind: 'simulation',
    modelVersion: MODEL_VERSION,
    grade: 'B',
    sort: 'input_fingerprint',
    arbitrary: 'secret',
  }));

  assert.deepEqual([...query.keys()], ['page', 'size', 'from', 'to', 'kind', 'modelVersion', 'grade']);
  assert.equal(query.get('modelVersion'), MODEL_VERSION);
  assert.equal(query.has('sort'), false);
  assert.equal(query.has('arbitrary'), false);
});

test('invalid, reversed, and excessive date filters are identified', () => {
  assert.equal(validateDateRange('2026-02-30', '2026-03-01'), 'invalid');
  assert.equal(validateDateRange('2026-08-02', '2026-08-01'), 'reversed');
  assert.equal(validateDateRange('2025-08-24', '2026-08-26'), 'tooLong');
  assert.equal(validateDateRange('2025-08-25', '2026-08-26'), null);
  assert.equal(validateDateRange('2026-08-01', '2026-08-02'), null);
});

test('pagination normalization is bounded and internally consistent', () => {
  assert.deepEqual(normalizePagination({ page: '2', size: '10', total: '21', totalPages: '3' }), {
    page: 2,
    size: 10,
    total: 21,
    totalPages: 3,
  });
  assert.deepEqual(normalizePagination({ page: Infinity, size: 1000, total: 'bad' }), {
    page: 1,
    size: 20,
    total: 0,
    totalPages: 0,
  });
  assert.deepEqual(normalizePagination({ page: true, size: true, total: true, totalPages: true }), {
    page: 1,
    size: 20,
    total: 0,
    totalPages: 0,
  });
});

test('history sorting is chronological and does not mutate source rows', () => {
  const source = [...rows, { id: 4, createdAt: 'invalid' }];
  const sorted = sortHistoryChronologically(source);
  assert.deepEqual(sorted.map((row) => row.id), [1, 2, 3, 4]);
  assert.deepEqual(source.map((row) => row.id), [3, 1, 2, 4]);
});

test('chart transformations sort dates, separate kinds, and omit missing averages', () => {
  const charts = buildCurrentPageCharts(rows, labels, colors);
  assert.deepEqual(charts.volume.labels, ['2026-08-01', '2026-08-02', '2026-08-03']);
  assert.deepEqual(charts.volume.datasets.map((dataset) => dataset.label), ['Production', 'Simulation']);
  assert.deepEqual(charts.confidence.datasets[0].data, [90, 70, null]);
  assert.equal(charts.confidence.datasets.some((dataset) => dataset.label === 'Simulation'), false);
  assert.deepEqual(charts.grades.datasets[1].data, [0, 1, 0, 0, 0]);
  const localizedVolume = formatChartDateLabels(charts.volume, 'en-US');
  assert.deepEqual(localizedVolume.labels, ['Aug 1, 2026', 'Aug 2, 2026', 'Aug 3, 2026']);
  assert.deepEqual(charts.volume.labels, ['2026-08-01', '2026-08-02', '2026-08-03']);
  Object.values(charts).filter(Boolean).forEach((chart) => {
    chart.datasets.forEach((dataset) => {
      dataset.data.filter((value) => value !== null).forEach((value) => assert.equal(Number.isFinite(value), true));
    });
  });
});

test('chart transformations reject malformed timestamps and metric ranges', () => {
  const charts = buildCurrentPageCharts([
    ...rows,
    { id: 4, createdAt: null, predictionKind: 'prediction', gradeConfidence: 0.5 },
    { id: 5, createdAt: '2026-08-04T10:00:00Z', predictionKind: 'prediction', gradeConfidence: 2, inferenceLatencyMs: -1 },
  ], labels, colors);

  assert.deepEqual(charts.volume.labels, ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
  assert.equal(charts.confidence.datasets[0].data[3], null);
  assert.equal(charts.latency.datasets[0].data[3], null);
  assert.deepEqual(buildCurrentPageCharts({ hostile: true }, labels, colors), {
    volume: null,
    confidence: null,
    latency: null,
    grades: null,
  });
});

test('page summary is explicitly derived from bounded valid rows', () => {
  const summary = derivePageSummary([
    ...rows,
    { gradeConfidence: 2, inferenceLatencyMs: -10 },
  ]);
  assert.equal(summary.averageInferenceLatency, 20);
  assert.ok(Math.abs(summary.averageGradeConfidence - 0.8) < Number.EPSILON * 2);
  assert.equal(summary.mostCommonGrade, 'A');
});

test('model versions are shortened only after strict validation', () => {
  const short = shortenModelVersion(MODEL_VERSION);
  assert.equal(short, `${'a'.repeat(10)}…${'a'.repeat(6)}`);
  assert.equal(shortenModelVersion('javascript:alert(1)'), EMPTY_VALUE);
  assert.equal(shortenModelVersion('A'.repeat(64)), EMPTY_VALUE);
});

test('default filters use a bounded thirty-day UTC window', () => {
  assert.deepEqual(createDefaultFilters(new Date('2026-08-26T12:00:00Z')), {
    from: '2026-07-28',
    to: '2026-08-26',
    kind: '',
    grade: '',
    size: 20,
    page: 1,
  });
});
