import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTrendChange,
  getTrendStatus,
  normalizePerformanceTrend,
} from './studentPerformanceTrend.js';

test('calculates chronological score change and improving status', () => {
  const result = normalizePerformanceTrend({ rows: [
    { id: 2, createdAt: '2026-08-02T10:00:00Z', predictedScore: 84, predictedGrade: 'B' },
    { id: 1, createdAt: '2026-08-01T10:00:00Z', predictedScore: 76, predictedGrade: 'C' },
  ] });

  assert.deepEqual(result.scoreRows.map((row) => row.predictedScore), [76, 84]);
  assert.equal(result.latestScore, 84);
  assert.equal(result.previousScore, 76);
  assert.equal(result.change, 8);
  assert.equal(result.predictedScore, 84);
  assert.equal(result.trendStatus, 'Improving');
  assert.equal(formatTrendChange(result.change, String), '+8');
});

test('classifies stable and declining score changes', () => {
  assert.equal(getTrendStatus(0.5), 'Stable');
  assert.equal(getTrendStatus(-0.99), 'Stable');
  assert.equal(getTrendStatus(-1), 'Declining');
  assert.equal(getTrendStatus(1), 'Improving');
});

test('keeps missing and invalid values out of trend calculations', () => {
  const result = normalizePerformanceTrend({ rows: [
    { id: 1, createdAt: '2026-08-01T10:00:00Z', predictedScore: 'not-a-score', predictedGrade: 'Z' },
    { id: 2, createdAt: '2026-08-02T10:00:00Z', predictedScore: 90, predictedGrade: null },
    { id: 3, createdAt: '2026-08-03T10:00:00Z', predictedScore: null, predictedGrade: 'A' },
    { id: 4, createdAt: 'invalid', predictedScore: 20, predictedGrade: 'F' },
  ] });

  assert.equal(result.hasData, true);
  assert.deepEqual(result.scoreRows.map((row) => row.predictedScore), [90]);
  assert.equal(result.latestScore, 90);
  assert.equal(result.previousScore, null);
  assert.equal(result.change, null);
  assert.equal(result.trendStatus, 'Stable');
  assert.deepEqual(result.gradeRows.map((row) => row.predictedGrade), ['A']);
});

test('returns an empty safe state for malformed or missing history', () => {
  for (const response of [undefined, null, {}, { rows: [] }, { rows: 'invalid' }]) {
    const result = normalizePerformanceTrend(response);
    assert.deepEqual(result.rows, []);
    assert.equal(result.hasData, false);
    assert.equal(result.latestScore, null);
    assert.equal(result.change, null);
  }
});
