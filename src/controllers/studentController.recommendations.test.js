'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const studyRecommendationService = require('../services/studyRecommendationService');
const { apiStudentRecommendations } = require('./studentController');

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request(overrides = {}) {
  return { user: { id: 7, studentId: 42 }, ...overrides };
}

test('recommendations rejects accounts without a linked student', async () => {
  const original = studyRecommendationService.getRecommendations;
  let calls = 0;
  studyRecommendationService.getRecommendations = async () => { calls += 1; };
  try {
    const res = response();
    await apiStudentRecommendations(request({ user: { id: 7 } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls, 0);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  } finally {
    studyRecommendationService.getRecommendations = original;
  }
});

test('recommendations returns 404 when the linked student is missing', async () => {
  const original = studyRecommendationService.getRecommendations;
  studyRecommendationService.getRecommendations = async () => null;
  try {
    const res = response();
    await apiStudentRecommendations(request(), res);
    assert.equal(res.statusCode, 404);
  } finally {
    studyRecommendationService.getRecommendations = original;
  }
});

test('recommendations passes trusted IDs and returns only the service result', async () => {
  const original = studyRecommendationService.getRecommendations;
  let received;
  const result = {
    overallStatus: 'On Track',
    recommendations: [{ title: 'safe', explanation: 'safe', priority: 'low', nextStep: 'safe' }],
    summary: { predictedScore: 80 },
  };
  studyRecommendationService.getRecommendations = async (options) => {
    received = options;
    return result;
  };
  try {
    const res = response();
    await apiStudentRecommendations(request({ body: { studentId: 999, userId: 999 } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(received, { studentId: 42, userId: 7 });
    assert.deepEqual(res.body, result);
  } finally {
    studyRecommendationService.getRecommendations = original;
  }
});

test('recommendations hides unexpected service failures', async () => {
  const original = studyRecommendationService.getRecommendations;
  const originalError = console.error;
  studyRecommendationService.getRecommendations = async () => { throw new Error('private database details'); };
  console.error = () => {};
  try {
    const res = response();
    await apiStudentRecommendations(request(), res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Failed to generate study recommendations.' });
    assert.equal(JSON.stringify(res.body).includes('private'), false);
  } finally {
    studyRecommendationService.getRecommendations = original;
    console.error = originalError;
  }
});
