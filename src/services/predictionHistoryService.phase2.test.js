'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const service = require('./predictionHistoryService');

const originalQuery = pool.query;
const MODEL_VERSION = 'b'.repeat(64);
const NOW = new Date('2026-08-26T12:00:00.000Z');

describe('predictionHistoryService Phase 2 history queries', () => {
  beforeEach(() => {
    pool.query = originalQuery;
  });

  afterEach(() => {
    pool.query = originalQuery;
  });

  it('applies bounded pagination and a deterministic default 30-day window', () => {
    const filters = service.normalizeHistoryFilters({}, NOW);

    assert.equal(filters.page, 1);
    assert.equal(filters.size, 20);
    assert.equal(filters.to.toISOString(), '2026-08-26T12:00:00.000Z');
    assert.equal(filters.from.toISOString(), '2026-07-27T12:00:00.000Z');
    assert.equal(filters.kind, null);
    assert.equal(filters.modelVersion, null);
    assert.equal(filters.grade, null);
  });

  it('accepts maximum pagination and rejects invalid or excessive page values', () => {
    const filters = service.normalizeHistoryFilters({
      page: String(service.MAX_HISTORY_PAGE),
      size: String(service.MAX_HISTORY_PAGE_SIZE),
    }, NOW);
    assert.equal(filters.page, service.MAX_HISTORY_PAGE);
    assert.equal(filters.size, service.MAX_HISTORY_PAGE_SIZE);

    for (const options of [
      { page: 0 },
      { page: service.MAX_HISTORY_PAGE + 1 },
      { size: 0 },
      { size: service.MAX_HISTORY_PAGE_SIZE + 1 },
      { page: '1.5' },
      { size: 'Infinity' },
    ]) {
      assert.throws(() => service.normalizeHistoryFilters(options, NOW));
    }
  });

  it('normalizes calendar dates and strict UTC timestamps', () => {
    const dates = service.normalizeHistoryFilters({
      from: '2026-08-01',
      to: '2026-08-02',
    }, NOW);
    assert.equal(dates.from.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(dates.to.toISOString(), '2026-08-02T23:59:59.999Z');

    const timestamps = service.normalizeHistoryFilters({
      from: '2026-08-01T10:20:30Z',
      to: '2026-08-02T10:20:30.125Z',
    }, NOW);
    assert.equal(timestamps.from.toISOString(), '2026-08-01T10:20:30.000Z');
    assert.equal(timestamps.to.toISOString(), '2026-08-02T10:20:30.125Z');
  });

  it('rejects invalid, reversed, and overlong date ranges', () => {
    for (const options of [
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-02-30T10:00:00Z', to: '2026-03-01T10:00:00Z' },
      { from: '2026-08-01T24:00:00Z', to: '2026-08-02T10:00:00Z' },
      { from: '08/01/2026', to: '2026-08-02' },
      { from: '2026-08-02', to: '2026-08-01' },
      { from: '2025-01-01', to: '2026-08-01' },
      { from: 123, to: '2026-08-01' },
    ]) {
      assert.throws(() => service.normalizeHistoryFilters(options, NOW));
    }
  });

  it('allowlists kind, grade, model version, and filter field names', () => {
    const filters = service.normalizeHistoryFilters({
      kind: 'simulation',
      grade: 'A',
      modelVersion: MODEL_VERSION,
    }, NOW);
    assert.equal(filters.kind, 'simulation');
    assert.equal(filters.grade, 'A');
    assert.equal(filters.modelVersion, MODEL_VERSION);

    assert.throws(() => service.normalizeHistoryFilters({ kind: 'other' }, NOW), /kind/);
    assert.throws(() => service.normalizeHistoryFilters({ grade: 'E' }, NOW), /grade/);
    assert.throws(
      () => service.normalizeHistoryFilters({ modelVersion: 'short' }, NOW),
      /modelVersion/
    );
    assert.throws(
      () => service.normalizeHistoryFilters({ sort: 'input_fingerprint' }, NOW),
      /Unknown history filter field/
    );
  });

  it('uses parameterized count and row queries and returns normalized pagination', async () => {
    const calls = [];
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      if (/COUNT\(\*\) AS total/.test(sql)) return [[{ total: '21' }]];
      return [[{
        id: '9',
        created_at: '2026-08-20T10:00:00.000Z',
        prediction_kind: 'prediction',
        model_version: MODEL_VERSION,
        predicted_score: '88.25',
        predicted_grade: 'B',
        grade_confidence: '0.875',
        inference_latency_ms: '34',
        student_id: '42',
        input_fingerprint: 'must-not-be-returned',
        study_hours: '5.5',
      }]];
    };

    const result = await service.listPredictionHistory({
      page: '2',
      size: '10',
      from: '2026-08-01',
      to: '2026-08-25',
      kind: 'prediction',
      modelVersion: MODEL_VERSION,
      grade: 'B',
    });

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.sql, /e\.created_at >= \?/);
      assert.match(call.sql, /e\.created_at <= \?/);
      assert.match(call.sql, /e\.prediction_kind = \?/);
      assert.match(call.sql, /s\.model_version = \?/);
      assert.match(call.sql, /e\.predicted_grade = \?/);
      assert.equal(call.sql.includes(MODEL_VERSION), false);
    }
    const rowCall = calls.find((call) => /ORDER BY/.test(call.sql));
    assert.match(rowCall.sql, /ORDER BY e\.created_at DESC, e\.id DESC/);
    assert.match(rowCall.sql, /LIMIT \? OFFSET \?/);
    assert.deepEqual(rowCall.params.slice(-2), [10, 10]);

    assert.equal(result.total, 21);
    assert.equal(result.totalPages, 3);
    assert.equal(result.page, 2);
    assert.equal(result.size, 10);
    assert.deepEqual(result.rows[0], {
      id: 9,
      createdAt: '2026-08-20T10:00:00.000Z',
      predictionKind: 'prediction',
      modelVersion: MODEL_VERSION,
      predictedScore: 88.25,
      predictedGrade: 'B',
      gradeConfidence: 0.875,
      inferenceLatencyMs: 34,
      studentId: 42,
    });
    assert.equal(Object.hasOwn(result.rows[0], 'inputFingerprint'), false);
    assert.equal(Object.hasOwn(result.rows[0], 'studyHours'), false);
    assert.equal(Object.hasOwn(result.rows[0], 'actorUserId'), false);
  });

  it('returns bounded empty pagination when database count data is malformed', async () => {
    pool.query = async (sql) => (/COUNT\(\*\)/.test(sql) ? [[{ total: 'invalid' }]] : [[]]);

    const result = await service.listPredictionHistory({
      from: '2026-08-01',
      to: '2026-08-02',
    });

    assert.deepEqual(result.rows, []);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
  });
});
