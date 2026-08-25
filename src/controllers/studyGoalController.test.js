'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const studyGoalService = require('../services/studyGoalService');
const { pool } = require('../config/db');
const {
  apiGetGoal,
  apiListGoalsWithProgress,
  apiCreateCheckIn,
  apiUpdateCheckIn,
} = require('./studyGoalController');

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

function createRequest(overrides = {}) {
  return {
    params: { goalId: '8', checkinId: '99' },
    body: {},
    user: { id: 5, studentId: 42 },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    ...overrides,
  };
}

function preserve(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}

test('student progress list returns the existing enriched service read model', async () => {
  const originals = preserve(studyGoalService, ['getGoalsWithProgressByStudent']);
  let receivedStudentId = null;
  const goals = [{
    goal: { id: 8, student_id: 42 },
    checkIns: [],
    progress: { status: 'insufficient_data' },
  }];
  studyGoalService.getGoalsWithProgressByStudent = async (studentId) => {
    receivedStudentId = studentId;
    return goals;
  };

  try {
    const res = createResponse();
    await apiListGoalsWithProgress(createRequest(), res);

    assert.equal(receivedStudentId, 42);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { goals });
  } finally {
    Object.assign(studyGoalService, originals);
  }
});

test('student progress list keeps database failures out of the response', async () => {
  const originals = preserve(studyGoalService, ['getGoalsWithProgressByStudent']);
  const originalConsoleError = console.error;
  studyGoalService.getGoalsWithProgressByStudent = async () => {
    throw new Error('database internals');
  };
  console.error = () => {};

  try {
    const res = createResponse();
    await apiListGoalsWithProgress(createRequest(), res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Failed to load goal progress.' });
  } finally {
    Object.assign(studyGoalService, originals);
    console.error = originalConsoleError;
  }
});

test('student check-in creation rejects teacher feedback before database work', async () => {
  const originals = preserve(studyGoalService, ['getGoalById', 'createCheckIn']);
  let calls = 0;
  studyGoalService.getGoalById = async () => { calls += 1; };
  studyGoalService.createCheckIn = async () => { calls += 1; };

  try {
    const res = createResponse();
    await apiCreateCheckIn(createRequest({
      body: { teacher_feedback: 'This must be staff-only.' },
    }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /only be updated by a teacher/i);
    assert.equal(calls, 0);
  } finally {
    Object.assign(studyGoalService, originals);
  }
});

test('student check-in updates reject teacher feedback before database work', async () => {
  const originals = preserve(studyGoalService, ['getCheckInById', 'updateCheckIn']);
  let calls = 0;
  studyGoalService.getCheckInById = async () => { calls += 1; };
  studyGoalService.updateCheckIn = async () => { calls += 1; };

  try {
    const res = createResponse();
    await apiUpdateCheckIn(createRequest({
      body: { teacher_feedback: 'This must be staff-only.' },
    }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /only be updated by a teacher/i);
    assert.equal(calls, 0);
  } finally {
    Object.assign(studyGoalService, originals);
  }
});

test('student goal IDs must be complete positive safe integers', async () => {
  const originals = preserve(studyGoalService, ['getGoalByIdForStudent']);
  let calls = 0;
  studyGoalService.getGoalByIdForStudent = async () => { calls += 1; };

  try {
    const res = createResponse();
    await apiGetGoal(createRequest({ params: { goalId: '8not-an-id' } }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid goal ID.');
    assert.equal(calls, 0);
  } finally {
    Object.assign(studyGoalService, originals);
  }
});

test('student check-in updates persist a valid changed week start', async () => {
  const originals = preserve(studyGoalService, [
    'getCheckInByIdForGoalAndStudent',
    'getCheckInByGoalAndWeek',
    'updateCheckIn',
    'getCheckInById',
  ]);
  const originalPoolQuery = pool.query;
  let updates;
  studyGoalService.getCheckInByIdForGoalAndStudent = async () => ({
    id: 99,
    goal_id: 8,
    week_start: '2026-08-03',
  });
  studyGoalService.getCheckInByGoalAndWeek = async () => null;
  studyGoalService.updateCheckIn = async (_checkInId, nextUpdates) => {
    updates = nextUpdates;
    return true;
  };
  studyGoalService.getCheckInById = async () => ({ id: 99, week_start: '2026-08-10' });
  pool.query = async () => [{ affectedRows: 1 }];

  try {
    const res = createResponse();
    await apiUpdateCheckIn(createRequest({
      body: { week_start: '2026-08-10', current_score: null },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(updates, { weekStart: '2026-08-10', currentScore: null });
    assert.deepEqual(res.body, { checkIn: { id: 99, week_start: '2026-08-10' } });
  } finally {
    Object.assign(studyGoalService, originals);
    pool.query = originalPoolQuery;
  }
});
