'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../config/db');
const studyGoalService = require('../services/studyGoalService');
const goalNotificationService = require('../services/goalNotificationService');
const {
  apiGetGoal,
  apiListGoalsWithProgress,
  apiCreateCheckIn,
  apiUpdateCheckIn,
  apiUpdateGoal,
} = require('./studyGoalController');

const originalPoolQuery = pool.query;

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

test.afterEach(() => {
  pool.query = originalPoolQuery;
});

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

test('goal completion event runs only after a real persisted transition', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getGoalByIdForStudent',
    'updateGoalForStudent',
  ]);
  const notificationOriginals = preserve(goalNotificationService, ['notifyGoalCompleted']);
  const calls = [];
  let event;
  studyGoalService.getGoalByIdForStudent = async () => calls.length === 0
    ? (calls.push('before'), { id: 8, student_id: 42, status: 'active' })
    : { id: 8, student_id: 42, status: 'completed' };
  studyGoalService.updateGoalForStudent = async () => {
    calls.push('update');
    return { found: true, updated: true };
  };
  goalNotificationService.notifyGoalCompleted = async (payload) => {
    calls.push('notification');
    event = payload;
  };
  pool.query = async () => [{ affectedRows: 1 }];

  try {
    const res = createResponse();
    await apiUpdateGoal(createRequest({ body: { status: 'completed' } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(event, { userId: 5, goalId: 8 });
    assert.ok(calls.indexOf('update') < calls.indexOf('notification'));
  } finally {
    Object.assign(studyGoalService, serviceOriginals);
    Object.assign(goalNotificationService, notificationOriginals);
  }
});

test('already completed or failed goal writes create no completion event', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getGoalByIdForStudent',
    'updateGoalForStudent',
  ]);
  const notificationOriginals = preserve(goalNotificationService, ['notifyGoalCompleted']);
  let events = 0;
  studyGoalService.getGoalByIdForStudent = async () => ({
    id: 8,
    student_id: 42,
    status: 'completed',
  });
  studyGoalService.updateGoalForStudent = async () => ({ found: true, updated: true });
  goalNotificationService.notifyGoalCompleted = async () => { events += 1; };
  pool.query = async () => [{ affectedRows: 1 }];

  try {
    const completedRes = createResponse();
    await apiUpdateGoal(createRequest({ body: { status: 'completed' } }), completedRes);
    assert.equal(completedRes.statusCode, 200);
    assert.equal(events, 0);

    studyGoalService.getGoalByIdForStudent = async () => ({
      id: 8,
      student_id: 42,
      status: 'active',
    });
    studyGoalService.updateGoalForStudent = async () => ({ found: false, updated: false });
    const failedRes = createResponse();
    await apiUpdateGoal(createRequest({ body: { status: 'completed' } }), failedRes);
    assert.equal(failedRes.statusCode, 404);
    assert.equal(events, 0);
  } finally {
    Object.assign(studyGoalService, serviceOriginals);
    Object.assign(goalNotificationService, notificationOriginals);
  }
});

test('check-in creation persists before a best-effort progress attention event', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getGoalByIdForStudent',
    'getCheckInByGoalAndWeek',
    'createCheckIn',
  ]);
  const notificationOriginals = preserve(goalNotificationService, ['notifyProgressAttention']);
  const order = [];
  let notificationEvent;
  studyGoalService.getGoalByIdForStudent = async () => ({
    id: 8,
    student_id: 42,
    status: 'active',
  });
  studyGoalService.getCheckInByGoalAndWeek = async () => null;
  studyGoalService.createCheckIn = async () => {
    order.push('write');
    return { id: 99, goal_id: 8, week_start: '2026-08-24', notification_revision: 1 };
  };
  goalNotificationService.notifyProgressAttention = async (event) => {
    order.push('notification');
    notificationEvent = event;
  };
  pool.query = async () => [{ affectedRows: 1 }];

  try {
    const res = createResponse();
    await apiCreateCheckIn(createRequest({
      body: {
        study_hours: 8,
        sleep_hours: 8,
        attendance_percent: 95,
        week_start: '2026-08-24',
      },
    }), res);

    assert.equal(res.statusCode, 201);
    assert.ok(order.indexOf('write') < order.indexOf('notification'));
    assert.deepEqual(notificationEvent, {
      userId: 5,
      studentId: 42,
      goalId: 8,
      checkInId: 99,
      eventVersion: 1,
    });
  } finally {
    Object.assign(studyGoalService, serviceOriginals);
    Object.assign(goalNotificationService, notificationOriginals);
  }
});

test('check-in updates use the freshly persisted revision for progress attention', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getCheckInByIdForGoalAndStudent',
    'getCheckInById',
    'updateCheckIn',
  ]);
  const notificationOriginals = preserve(goalNotificationService, ['notifyProgressAttention']);
  let checkInReads = 0;
  let notificationEvent;
  studyGoalService.getCheckInByIdForGoalAndStudent = async () => ({
    id: 99,
    goal_id: 8,
    notification_revision: 2,
  });
  studyGoalService.getCheckInById = async () => {
    checkInReads += 1;
    return { id: 99, goal_id: 8, notification_revision: 3 };
  };
  studyGoalService.updateCheckIn = async () => true;
  goalNotificationService.notifyProgressAttention = async (event) => {
    notificationEvent = event;
  };
  pool.query = async () => [{ affectedRows: 1 }];

  try {
    const res = createResponse();
    await apiUpdateCheckIn(createRequest({ body: { study_hours: 9 } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.checkIn.notification_revision, 3);
    assert.deepEqual(notificationEvent, {
      userId: 5,
      studentId: 42,
      goalId: 8,
      checkInId: 99,
      eventVersion: 3,
    });
  } finally {
    Object.assign(studyGoalService, serviceOriginals);
    Object.assign(goalNotificationService, notificationOriginals);
  }
});

test('notification failures preserve successful check-in responses', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getGoalByIdForStudent',
    'getCheckInByGoalAndWeek',
    'createCheckIn',
  ]);
  const notificationOriginals = preserve(goalNotificationService, ['notifyProgressAttention']);
  const originalConsoleError = console.error;
  studyGoalService.getGoalByIdForStudent = async () => ({
    id: 8,
    student_id: 42,
    status: 'active',
  });
  studyGoalService.getCheckInByGoalAndWeek = async () => null;
  studyGoalService.createCheckIn = async () => ({
    id: 99,
    goal_id: 8,
    week_start: '2026-08-24',
    notification_revision: 1,
  });
  goalNotificationService.notifyProgressAttention = () => {
    throw new Error('notification storage unavailable');
  };
  pool.query = async () => [{ affectedRows: 1 }];
  console.error = () => {};

  try {
    const res = createResponse();
    await apiCreateCheckIn(createRequest({
      body: {
        study_hours: 8,
        sleep_hours: 8,
        attendance_percent: 95,
        week_start: '2026-08-24',
      },
    }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.checkIn.id, 99);
  } finally {
    Object.assign(studyGoalService, serviceOriginals);
    Object.assign(goalNotificationService, notificationOriginals);
    console.error = originalConsoleError;
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
  const notificationOriginals = preserve(goalNotificationService, ['notifyProgressAttention']);
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
  goalNotificationService.notifyProgressAttention = async () => {};
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
    Object.assign(goalNotificationService, notificationOriginals);
    pool.query = originalPoolQuery;
  }
});
