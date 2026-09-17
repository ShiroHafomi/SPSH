'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  apiStudentPerformanceTrend,
  apiStudentSimulate,
} = require('./studentController');
const studentService = require('../services/studentService');
const mlService = require('../services/mlService');
const predictionHistoryService = require('../services/predictionHistoryService');

const originalFindById = studentService.findById;
const originalSimulate = mlService.simulate;
const originalRecord = predictionHistoryService.recordPredictionEvent;
const originalListForStudent = predictionHistoryService.listPredictionHistoryForStudent;
const originalConsoleError = console.error;

const profile = Object.freeze({
  gender: 'Female',
  age: 20,
  study_hours_per_day: 4,
  attendance_percent: 85,
  sleep_hours: 7,
  previous_gpa: 3.2,
  parental_education: 'Master',
  internet_access: 1,
  extracurricular: 1,
  part_time_job: 0,
});
const current = Object.freeze({
  final_score: 80,
  grade: 'B',
  grade_confidence: 0.8,
});
const simulated = Object.freeze({
  final_score: 86,
  grade: 'B',
  grade_confidence: 0.85,
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
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

function createRequest(body = { study_hours_per_day: 5 }) {
  return {
    body,
    user: { id: 17, studentId: 29 },
    headers: {},
  };
}

describe('student performance trend history access', () => {
  beforeEach(() => {
    studentService.findById = async () => ({ id: 29 });
    predictionHistoryService.listPredictionHistoryForStudent = async () => ({ rows: [] });
  });

  afterEach(() => {
    studentService.findById = originalFindById;
    predictionHistoryService.listPredictionHistoryForStudent = originalListForStudent;
  });

  it('uses the authenticated student ID and returns only history data', async () => {
    let requestedStudentId;
    predictionHistoryService.listPredictionHistoryForStudent = async (studentId) => {
      requestedStudentId = studentId;
      return { rows: [{ studentId, predictedScore: 84 }] };
    };
    const res = createResponse();
    const req = createRequest({ studentId: 999 });

    await apiStudentPerformanceTrend(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(requestedStudentId, 29);
    assert.deepEqual(res.body, { rows: [{ studentId: 29, predictedScore: 84 }] });
  });

  it('rejects an unlinked student account before querying history', async () => {
    studentService.findById = async () => null;
    let historyCalled = false;
    predictionHistoryService.listPredictionHistoryForStudent = async () => {
      historyCalled = true;
      return { rows: [] };
    };
    const res = createResponse();
    const req = createRequest();
    req.user.studentId = null;

    await apiStudentPerformanceTrend(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(historyCalled, false);
  });

  it('returns not found when the authenticated student record is missing', async () => {
    studentService.findById = async () => null;
    const res = createResponse();

    await apiStudentPerformanceTrend(createRequest(), res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Student record not found.' });
  });
});

describe('student simulator prediction history integration', () => {
  beforeEach(() => {
    studentService.findById = async () => ({ id: 29, ...profile });
    mlService.simulate = async () => ({
      current: { ...current },
      simulated: { ...simulated },
      historyEntries: [
        { input: { ...profile }, result: { ...current }, inferenceLatencyMs: 8 },
        {
          input: { ...profile, study_hours_per_day: 5 },
          result: { ...simulated },
          inferenceLatencyMs: 9,
        },
      ],
    });
    predictionHistoryService.recordPredictionEvent = async () => ({ eventId: 1 });
    predictionHistoryService.listPredictionHistoryForStudent = async () => ({ rows: [] });
    console.error = originalConsoleError;
  });

  afterEach(() => {
    studentService.findById = originalFindById;
    mlService.simulate = originalSimulate;
    predictionHistoryService.recordPredictionEvent = originalRecord;
    predictionHistoryService.listPredictionHistoryForStudent = originalListForStudent;
    console.error = originalConsoleError;
  });

  it('records current and modified inferences as baseline and simulation', async () => {
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
    };
    const res = createResponse();

    await apiStudentSimulate(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.current.final_score, 80);
    assert.equal(res.body.simulated.final_score, 86);
    assert.equal(Object.hasOwn(res.body, 'historyEntries'), false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][2].predictionKind, 'baseline');
    assert.equal(calls[1][2].predictionKind, 'simulation');
    assert.equal(calls[0][2].actorUserId, 17);
    assert.equal(calls[0][2].studentId, 29);
    assert.equal(calls[1][2].actorUserId, 17);
    assert.equal(calls[1][2].studentId, 29);
  });

  it('records only a baseline when an empty request runs one inference', async () => {
    mlService.simulate = async () => ({
      current: { ...current },
      simulated: { ...current },
      historyEntries: [
        { input: { ...profile }, result: { ...current }, inferenceLatencyMs: 8 },
      ],
    });
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
    };
    const res = createResponse();

    await apiStudentSimulate(createRequest({}), res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].predictionKind, 'baseline');
  });

  it('ignores client kind and identity hints and uses trusted route context', async () => {
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
    };
    const res = createResponse();

    await apiStudentSimulate(createRequest({
      study_hours_per_day: 5,
      prediction_kind: 'prediction',
      actorUserId: 999,
      studentId: 999,
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls[0][2].predictionKind, 'baseline');
    assert.equal(calls[1][2].predictionKind, 'simulation');
    assert.equal(calls[0][2].actorUserId, 17);
    assert.equal(calls[0][2].studentId, 29);
  });

  it('preserves a successful simulation response if history writes fail', async () => {
    predictionHistoryService.recordPredictionEvent = async () => {
      throw new Error('Failed to record prediction event');
    };
    console.error = () => {};
    const res = createResponse();

    await apiStudentSimulate(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.current.final_score, 80);
    assert.equal(res.body.simulated.final_score, 86);
  });

  it('does not record history when simulation inference fails', async () => {
    let historyCalls = 0;
    mlService.simulate = async () => { throw new Error('Prediction failed'); };
    predictionHistoryService.recordPredictionEvent = async () => {
      historyCalls += 1;
    };
    console.error = () => {};
    const res = createResponse();

    await apiStudentSimulate(createRequest(), res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Simulation failed.' });
    assert.equal(historyCalls, 0);
  });
});
