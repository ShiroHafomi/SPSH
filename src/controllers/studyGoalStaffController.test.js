'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const studyGoalService = require('../services/studyGoalService');
const authService = require('../services/authService');
const goalNotificationService = require('../services/goalNotificationService');
const { requireRole } = require('../middleware/auth');
const {
  apiAdminListStudentGoals,
  apiTeacherGetStudentGoal,
  apiTeacherListStudentGoals,
  apiTeacherUpdateGoalFeedback,
} = require('./studyGoalStaffController');

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
    params: { studentId: '42', goalId: '8' },
    query: {},
    body: {},
    user: { id: 5, role: 'teacher' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    ...overrides,
  };
}

async function runRoleMiddleware(role, allowedRoles = ['admin', 'teacher']) {
  const req = { user: { role } };
  const res = createResponse();
  let calledNext = false;
  requireRole(...allowedRoles)(req, res, () => {
    calledNext = true;
  });
  return { res, calledNext };
}

function preserve(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}

function restore(object, methods) {
  Object.assign(object, methods);
}

test('teacher-compatible role middleware admits teachers and admins but rejects students', async () => {
  const teacher = await runRoleMiddleware('teacher');
  const admin = await runRoleMiddleware('admin');
  const student = await runRoleMiddleware('student');

  assert.equal(teacher.calledNext, true);
  assert.equal(admin.calledNext, true);
  assert.equal(student.calledNext, false);
  assert.equal(student.res.statusCode, 403);
  assert.equal(student.res.body.code, 'FORBIDDEN');
});

test('admin-only role middleware rejects teachers', async () => {
  const teacher = await runRoleMiddleware('teacher', ['admin']);
  const admin = await runRoleMiddleware('admin', ['admin']);

  assert.equal(teacher.calledNext, false);
  assert.equal(teacher.res.statusCode, 403);
  assert.equal(admin.calledNext, true);
});

test('teacher list passes the positive route student ID to shared service logic', async () => {
  const originals = preserve(studyGoalService, ['getGoalsWithProgressByStudent']);
  let receivedStudentId = null;
  studyGoalService.getGoalsWithProgressByStudent = async (studentId) => {
    receivedStudentId = studentId;
    return [{ goal: { id: 8 }, checkIns: [], progress: { status: 'insufficient_data' } }];
  };

  try {
    const res = createResponse();
    await apiTeacherListStudentGoals(createRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(receivedStudentId, 42);
    assert.equal(res.body.goals.length, 1);
  } finally {
    restore(studyGoalService, originals);
  }
});

test('teacher detail returns one non-disclosing 404 for mismatched student and goal', async () => {
  const originals = preserve(studyGoalService, ['getGoalWithProgressForStudent']);
  let received = null;
  studyGoalService.getGoalWithProgressForStudent = async (studentId, goalId) => {
    received = { studentId, goalId };
    return null;
  };

  try {
    const res = createResponse();
    await apiTeacherGetStudentGoal(createRequest(), res);

    assert.deepEqual(received, { studentId: 42, goalId: 8 });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Goal not found.' });
  } finally {
    restore(studyGoalService, originals);
  }
});

test('staff controllers reject invalid route IDs before service calls', async () => {
  const originals = preserve(studyGoalService, [
    'getGoalsWithProgressByStudent',
    'getGoalWithProgressForStudent',
  ]);
  let calls = 0;
  studyGoalService.getGoalsWithProgressByStudent = async () => { calls += 1; };
  studyGoalService.getGoalWithProgressForStudent = async () => { calls += 1; };

  try {
    const listRes = createResponse();
    await apiTeacherListStudentGoals(createRequest({ params: { studentId: '0' } }), listRes);
    const detailRes = createResponse();
    await apiTeacherGetStudentGoal(createRequest({ params: { studentId: '42', goalId: '8.5' } }), detailRes);

    assert.equal(listRes.statusCode, 400);
    assert.equal(detailRes.statusCode, 400);
    assert.equal(calls, 0);
  } finally {
    restore(studyGoalService, originals);
  }
});

test('teacher feedback updates only a securely resolved check-in, writes an audit event, and emits a private event', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getCheckInByIdForGoalAndStudent',
    'updateTeacherFeedbackWithOutcome',
  ]);
  const authOriginals = preserve(authService, ['logAuditEvent']);
  const notificationOriginals = preserve(goalNotificationService, ['notifyTeacherFeedback']);
  let lookupArgs = null;
  let updateArgs = null;
  let auditEvent = null;
  let notificationEvent = null;
  studyGoalService.getCheckInByIdForGoalAndStudent = async (...args) => {
    lookupArgs = args;
    return { id: 99, goal_id: 8, teacher_feedback: null, notification_revision: 2 };
  };
  studyGoalService.updateTeacherFeedbackWithOutcome = async (...args) => {
    updateArgs = args;
    return {
      changed: true,
      checkIn: {
        id: 99,
        goal_id: 8,
        teacher_feedback: 'Keep up the consistent work.',
        notification_revision: 3,
        updated_at: '2026-08-25 10:00:00',
      },
    };
  };
  authService.logAuditEvent = async (event) => {
    auditEvent = event;
  };
  goalNotificationService.notifyTeacherFeedback = async (event) => {
    notificationEvent = event;
  };

  try {
    const req = createRequest({
      body: { checkin_id: '99', teacher_feedback: 'Keep up the consistent work.' },
    });
    const res = createResponse();
    await apiTeacherUpdateGoalFeedback(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(lookupArgs, [99, 8, 42]);
    assert.deepEqual(updateArgs, [99, 8, 42, 'Keep up the consistent work.']);
    assert.equal(res.body.changed, true);
    assert.equal(res.body.checkIn.teacher_feedback, 'Keep up the consistent work.');
    assert.equal(res.body.checkIn.notification_revision, 3);
    assert.equal(auditEvent.action, 'UPDATE_CHECKIN_FEEDBACK');
    assert.equal(auditEvent.resourceId, 99);
    assert.deepEqual(auditEvent.metadata, { studentId: 42, goalId: 8, feedbackChanged: true });
    assert.deepEqual(notificationEvent, {
      studentId: 42,
      goalId: 8,
      checkInId: 99,
      eventVersion: 3,
    });
  } finally {
    restore(studyGoalService, serviceOriginals);
    restore(authService, authOriginals);
    restore(goalNotificationService, notificationOriginals);
  }
});

test('teacher feedback does not notify when the persisted value is unchanged', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getCheckInByIdForGoalAndStudent',
    'updateTeacherFeedbackWithOutcome',
  ]);
  const notificationOriginals = preserve(goalNotificationService, ['notifyTeacherFeedback']);
  let events = 0;
  studyGoalService.getCheckInByIdForGoalAndStudent = async () => ({
    id: 99,
    goal_id: 8,
    teacher_feedback: null,
  });
  studyGoalService.updateTeacherFeedbackWithOutcome = async () => ({
    changed: false,
    checkIn: { id: 99, goal_id: 8, teacher_feedback: 'Already saved.' },
  });
  goalNotificationService.notifyTeacherFeedback = async () => { events += 1; };

  try {
    const res = createResponse();
    await apiTeacherUpdateGoalFeedback(createRequest({
      body: { checkin_id: 99, teacher_feedback: 'Changed concurrently.' },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.changed, false);
    assert.equal(events, 0);
  } finally {
    restore(studyGoalService, serviceOriginals);
    restore(goalNotificationService, notificationOriginals);
  }
});

test('teacher feedback retains its successful response when notification delivery fails', async () => {
  const serviceOriginals = preserve(studyGoalService, [
    'getCheckInByIdForGoalAndStudent',
    'updateTeacherFeedbackWithOutcome',
  ]);
  const authOriginals = preserve(authService, ['logAuditEvent']);
  const notificationOriginals = preserve(goalNotificationService, ['notifyTeacherFeedback']);
  const originalConsoleError = console.error;
  studyGoalService.getCheckInByIdForGoalAndStudent = async () => ({ id: 99, goal_id: 8, teacher_feedback: null });
  studyGoalService.updateTeacherFeedbackWithOutcome = async () => ({
    changed: true,
    checkIn: { id: 99, goal_id: 8, notification_revision: 3 },
  });
  authService.logAuditEvent = async () => {};
  goalNotificationService.notifyTeacherFeedback = () => {
    throw new Error('notification storage unavailable');
  };
  console.error = () => {};

  try {
    const res = createResponse();
    await apiTeacherUpdateGoalFeedback(createRequest({
      body: { checkin_id: 99, teacher_feedback: 'Keep going.' },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.changed, true);
  } finally {
    restore(studyGoalService, serviceOriginals);
    restore(authService, authOriginals);
    restore(goalNotificationService, notificationOriginals);
    console.error = originalConsoleError;
  }
});

test('teacher feedback rejects oversized content and does not call services', async () => {
  const originals = preserve(studyGoalService, ['getCheckInByIdForGoalAndStudent']);
  let called = false;
  studyGoalService.getCheckInByIdForGoalAndStudent = async () => { called = true; };

  try {
    const res = createResponse();
    await apiTeacherUpdateGoalFeedback(createRequest({
      body: { checkin_id: 99, teacher_feedback: 'x'.repeat(1001) },
    }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /cannot exceed 1000/i);
    assert.equal(called, false);
  } finally {
    restore(studyGoalService, originals);
  }
});

test('teacher feedback returns 404 for a missing or mismatched check-in', async () => {
  const originals = preserve(studyGoalService, ['getCheckInByIdForGoalAndStudent']);
  studyGoalService.getCheckInByIdForGoalAndStudent = async () => null;

  try {
    const res = createResponse();
    await apiTeacherUpdateGoalFeedback(createRequest({
      body: { checkin_id: 99, teacher_feedback: 'Review the next assignment.' },
    }), res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Goal check-in not found.' });
  } finally {
    restore(studyGoalService, originals);
  }
});

test('admin goal list validates bounded pagination and shares progress service calls', async () => {
  const originals = preserve(studyGoalService, [
    'getGoalsWithProgressByStudent',
    'countGoalsByStudent',
  ]);
  let received = null;
  studyGoalService.getGoalsWithProgressByStudent = async (...args) => {
    received = args;
    return [{ goal: { id: 8 }, checkIns: [], progress: { status: 'insufficient_data' } }];
  };
  studyGoalService.countGoalsByStudent = async () => 101;

  try {
    const res = createResponse();
    await apiAdminListStudentGoals(createRequest({ query: { page: '3', size: '50' } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(received, [42, { page: 3, size: 50 }]);
    assert.equal(res.body.total, 101);
    assert.equal(res.body.totalPages, 3);

    const invalidRes = createResponse();
    await apiAdminListStudentGoals(createRequest({ query: { page: '1', size: '101' } }), invalidRes);
    assert.equal(invalidRes.statusCode, 400);
  } finally {
    restore(studyGoalService, originals);
  }
});

test('staff controllers return safe 500 errors when the database service fails', async () => {
  const originals = preserve(studyGoalService, ['getGoalWithProgressForStudent']);
  const originalConsoleError = console.error;
  studyGoalService.getGoalWithProgressForStudent = async () => {
    throw new Error('SQL details must not reach clients');
  };
  console.error = () => {};

  try {
    const res = createResponse();
    await apiTeacherGetStudentGoal(createRequest(), res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Failed to load student goal.' });
  } finally {
    restore(studyGoalService, originals);
    console.error = originalConsoleError;
  }
});
