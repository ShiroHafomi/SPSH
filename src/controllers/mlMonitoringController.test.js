'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const predictionHistoryService = require('../services/predictionHistoryService');
const mlDriftService = require('../services/mlDriftService');
const { requireRole } = require('../middleware/auth');
const {
  apiGetMlDrift,
  apiListMlPredictions,
} = require('./mlMonitoringController');

const originalListPredictionHistory = predictionHistoryService.listPredictionHistory;
const originalGetDriftReport = mlDriftService.getDriftReport;
const originalConsoleError = console.error;

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function runRole(role, allowedRoles) {
  const req = { user: { role } };
  const res = createResponse();
  let calledNext = false;
  requireRole(...allowedRoles)(req, res, () => {
    calledNext = true;
  });
  return { calledNext, res };
}

describe('ML monitoring controller and authorization', () => {
  beforeEach(() => {
    predictionHistoryService.listPredictionHistory = originalListPredictionHistory;
    mlDriftService.getDriftReport = originalGetDriftReport;
    console.error = () => {};
  });

  afterEach(() => {
    predictionHistoryService.listPredictionHistory = originalListPredictionHistory;
    mlDriftService.getDriftReport = originalGetDriftReport;
    console.error = originalConsoleError;
  });

  it('admits admins on admin routes and teachers on teacher routes but denies students', () => {
    assert.equal(runRole('admin', ['admin']).calledNext, true);
    assert.equal(runRole('teacher', ['admin', 'teacher']).calledNext, true);

    const adminStudent = runRole('student', ['admin']);
    const teacherStudent = runRole('student', ['admin', 'teacher']);
    assert.equal(adminStudent.calledNext, false);
    assert.equal(adminStudent.res.statusCode, 403);
    assert.equal(adminStudent.res.body.code, 'FORBIDDEN');
    assert.equal(teacherStudent.calledNext, false);
    assert.equal(teacherStudent.res.statusCode, 403);
  });

  it('returns normalized history from the shared bounded service', async () => {
    let received;
    predictionHistoryService.listPredictionHistory = async (query) => {
      received = query;
      return {
        rows: [],
        page: 2,
        size: 10,
        total: 0,
        totalPages: 0,
        filters: {
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-02T23:59:59.999Z',
          kind: null,
          modelVersion: null,
          grade: null,
        },
      };
    };
    const query = { page: '2', size: '10' };
    const res = createResponse();

    await apiListMlPredictions({ query }, res);

    assert.equal(received, query);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.page, 2);
    assert.deepEqual(res.body.rows, []);
  });

  it('returns drift reports including explicit insufficient-data responses with HTTP 200', async () => {
    mlDriftService.getDriftReport = async () => ({
      modelVersion: 'd'.repeat(64),
      window: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-02T23:59:59.999Z',
      },
      method: 'absolute_standardized_mean_shift',
      minimumSampleSize: 30,
      overallStatus: 'insufficient_data',
      features: [],
    });
    const res = createResponse();

    await apiGetMlDrift({ query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.overallStatus, 'insufficient_data');
  });

  it('returns 400 for invalid history and drift filters without exposing internals', async () => {
    predictionHistoryService.listPredictionHistory = async () => {
      throw new RangeError('size must be a positive integer');
    };
    mlDriftService.getDriftReport = async () => {
      throw new TypeError('Drift filters must be an object');
    };

    const historyRes = createResponse();
    await apiListMlPredictions({ query: { size: '0' } }, historyRes);
    const driftRes = createResponse();
    await apiGetMlDrift({ query: null }, driftRes);

    assert.equal(historyRes.statusCode, 400);
    assert.deepEqual(historyRes.body, { error: 'size must be a positive integer' });
    assert.equal(driftRes.statusCode, 400);
    assert.deepEqual(driftRes.body, { error: 'Drift filters must be an object' });
  });

  it('returns a safe 404 when a selected model snapshot is unavailable', async () => {
    mlDriftService.getDriftReport = async () => null;
    const res = createResponse();

    await apiGetMlDrift({ query: { modelVersion: 'e'.repeat(64) } }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Model snapshot not found.' });
  });

  it('does not expose SQL or connection details in internal-error responses', async () => {
    predictionHistoryService.listPredictionHistory = async () => {
      throw new Error('SELECT secret FROM users at mysql://root:password@localhost');
    };
    mlDriftService.getDriftReport = async () => {
      throw new Error('ER_ACCESS_DENIED_ERROR root password');
    };

    const historyRes = createResponse();
    await apiListMlPredictions({ query: {} }, historyRes);
    const driftRes = createResponse();
    await apiGetMlDrift({ query: {} }, driftRes);

    assert.equal(historyRes.statusCode, 500);
    assert.deepEqual(historyRes.body, { error: 'Failed to load prediction history.' });
    assert.equal(driftRes.statusCode, 500);
    assert.deepEqual(driftRes.body, { error: 'Failed to load model drift report.' });
    assert.doesNotMatch(JSON.stringify([historyRes.body, driftRes.body]), /SELECT|mysql|password/i);
  });
});
