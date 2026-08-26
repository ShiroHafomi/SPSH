'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  apiPredict,
  apiFeedback,
  apiBaselinePrediction,
  apiSimulationPrediction,
} = require('./apiController');
const mlService = require('../services/mlService');
const predictionHistoryService = require('../services/predictionHistoryService');

const originalPredict = mlService.predict;
const originalRecord = predictionHistoryService.recordPredictionEvent;
const originalConsoleError = console.error;

const validInput = Object.freeze({
  gender: 'Female',
  age: 20,
  study_hours_per_day: 4.5,
  attendance_percent: 88,
  sleep_hours: 7.5,
  previous_gpa: 3.4,
  parental_education: 'Master',
  internet_access: 1,
  extracurricular: 1,
  part_time_job: 0,
});
const prediction = Object.freeze({
  final_score: 86.25,
  grade: 'B',
  grade_confidence: 0.84,
  grade_probabilities: { A: 0.1, B: 0.84, C: 0.06 },
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

function createRequest(overrides = {}) {
  return {
    body: { ...validInput },
    user: { id: 101, studentId: null },
    ...overrides,
  };
}

describe('apiController prediction history integration', () => {
  beforeEach(() => {
    mlService.predict = async () => ({ ...prediction });
    predictionHistoryService.recordPredictionEvent = async () => ({ eventId: 1 });
    console.error = originalConsoleError;
  });

  afterEach(() => {
    mlService.predict = originalPredict;
    predictionHistoryService.recordPredictionEvent = originalRecord;
    console.error = originalConsoleError;
  });

  it('records exactly one real prediction with the authenticated actor', async () => {
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
      return { eventId: 1 };
    };
    const req = createRequest();
    const res = createResponse();

    await apiPredict(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, prediction);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], validInput);
    assert.deepEqual(calls[0][1], prediction);
    assert.equal(calls[0][2].predictionKind, 'prediction');
    assert.equal(calls[0][2].actorUserId, 101);
    assert.equal(calls[0][2].studentId, null);
    assert.ok(Number.isInteger(calls[0][2].inferenceLatencyMs));
    assert.ok(calls[0][2].inferenceLatencyMs >= 0);
  });

  it('keeps the successful prediction response when history persistence fails', async () => {
    predictionHistoryService.recordPredictionEvent = async () => {
      throw new Error('Failed to record prediction event');
    };
    console.error = () => {};
    const res = createResponse();

    await apiPredict(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, prediction);
  });

  it('does not record an event when validation fails', async () => {
    let inferenceCalls = 0;
    let historyCalls = 0;
    mlService.predict = async () => {
      inferenceCalls += 1;
      return prediction;
    };
    predictionHistoryService.recordPredictionEvent = async () => {
      historyCalls += 1;
    };
    const res = createResponse();

    await apiPredict(createRequest({ body: { ...validInput, unknown: true } }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Unknown field: unknown/);
    assert.equal(inferenceCalls, 0);
    assert.equal(historyCalls, 0);
  });

  it('does not record an event when inference fails', async () => {
    let historyCalls = 0;
    mlService.predict = async () => { throw new Error('Prediction failed'); };
    predictionHistoryService.recordPredictionEvent = async () => {
      historyCalls += 1;
    };
    const res = createResponse();

    await apiPredict(createRequest(), res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Prediction failed' });
    assert.equal(historyCalls, 0);
  });

  it('cannot accept actor or student identity from the prediction body', async () => {
    let historyCalls = 0;
    predictionHistoryService.recordPredictionEvent = async () => {
      historyCalls += 1;
    };
    const res = createResponse();

    await apiPredict(createRequest({
      body: { ...validInput, actorUserId: 999, studentId: 999 },
    }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Unknown field/);
    assert.equal(historyCalls, 0);
  });

  it('maps feedback to feedback and preserves its response contract', async () => {
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
    };
    const res = createResponse();

    await apiFeedback(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.final_score, prediction.final_score);
    assert.equal(res.body.grade, prediction.grade);
    assert.equal(res.body.grade_confidence, prediction.grade_confidence);
    assert.deepEqual(res.body.grade_probabilities, prediction.grade_probabilities);
    assert.ok(res.body.feedback);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].predictionKind, 'feedback');
    assert.equal(calls[0][2].actorUserId, 101);
  });

  it('maps the trusted baseline route to baseline regardless of client hints', async () => {
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
    };
    const res = createResponse();

    await apiBaselinePrediction(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].predictionKind, 'baseline');
  });

  it('maps the trusted What-If route to simulation', async () => {
    const calls = [];
    predictionHistoryService.recordPredictionEvent = async (...args) => {
      calls.push(args);
    };
    const res = createResponse();

    await apiSimulationPrediction(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].predictionKind, 'simulation');
  });
});
