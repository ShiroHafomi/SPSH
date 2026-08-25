'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('./authService');
const notificationService = require('./notificationService');
const studyGoalService = require('./studyGoalService');
const goalNotificationService = require('./goalNotificationService');

function preserve(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}

test('UTC week calculation uses Monday and assigns Sunday to the prior week', () => {
  assert.equal(goalNotificationService.getUtcMonday(new Date('2026-08-24T23:59:59.999Z')), '2026-08-24');
  assert.equal(goalNotificationService.getUtcMonday(new Date('2026-08-30T23:59:59.999Z')), '2026-08-24');
  assert.equal(goalNotificationService.getUtcMonday(new Date('2026-08-31T00:00:00.000Z')), '2026-08-31');
});

test('teacher feedback notifies one uniquely linked student without persisting feedback text', async () => {
  const authOriginals = preserve(authService, ['findUniqueActiveStudentUserId']);
  const notificationOriginals = preserve(notificationService, [
    'getNotificationPreferences',
    'createNotification',
  ]);
  let resolvedStudentId;
  let created;
  authService.findUniqueActiveStudentUserId = async (studentId) => {
    resolvedStudentId = studentId;
    return 5;
  };
  notificationService.getNotificationPreferences = async (userId) => {
    assert.equal(userId, 5);
    return { teacherFeedback: true };
  };
  notificationService.createNotification = async (event) => {
    created = event;
    return { created: true };
  };

  try {
    const result = await goalNotificationService.notifyTeacherFeedback({
      studentId: 42,
      goalId: 8,
      checkInId: 99,
      eventVersion: 3,
    });

    assert.equal(result.created, true);
    assert.equal(resolvedStudentId, 42);
    assert.deepEqual(created, {
      userId: 5,
      type: 'teacher_feedback',
      metadata: { goalId: 8, checkinId: 99, eventVersion: 3 },
    });
    assert.equal(JSON.stringify(created.metadata).includes('feedback'), false);
  } finally {
    Object.assign(authService, authOriginals);
    Object.assign(notificationService, notificationOriginals);
  }
});

test('teacher feedback suppresses missing recipients and disabled preferences', async () => {
  const authOriginals = preserve(authService, ['findUniqueActiveStudentUserId']);
  const notificationOriginals = preserve(notificationService, [
    'getNotificationPreferences',
    'createNotification',
  ]);
  let createCalls = 0;
  authService.findUniqueActiveStudentUserId = async () => null;
  notificationService.getNotificationPreferences = async () => ({ teacherFeedback: true });
  notificationService.createNotification = async () => { createCalls += 1; };

  try {
    const unavailable = await goalNotificationService.notifyTeacherFeedback({
      studentId: 42, goalId: 8, checkInId: 99, eventVersion: 1,
    });
    assert.equal(unavailable.skipped, 'recipient_unavailable');

    authService.findUniqueActiveStudentUserId = async () => 5;
    notificationService.getNotificationPreferences = async () => ({ teacherFeedback: false });
    const disabled = await goalNotificationService.notifyTeacherFeedback({
      studentId: 42, goalId: 8, checkInId: 99, eventVersion: 1,
    });
    assert.equal(disabled.skipped, 'preference_disabled');
    assert.equal(createCalls, 0);
  } finally {
    Object.assign(authService, authOriginals);
    Object.assign(notificationService, notificationOriginals);
  }
});

test('goal completion uses the authenticated student preference and a goal-only identity', async () => {
  const originals = preserve(notificationService, ['getNotificationPreferences', 'createNotification']);
  let created;
  notificationService.getNotificationPreferences = async () => ({ goalReminders: true });
  notificationService.createNotification = async (event) => {
    created = event;
    return { created: true };
  };

  try {
    await goalNotificationService.notifyGoalCompleted({ userId: 5, goalId: 8 });
    assert.deepEqual(created, {
      userId: 5,
      type: 'goal_completed',
      metadata: { goalId: 8 },
    });

    notificationService.getNotificationPreferences = async () => ({ goalReminders: false });
    const disabled = await goalNotificationService.notifyGoalCompleted({ userId: 5, goalId: 8 });
    assert.equal(disabled.skipped, 'preference_disabled');
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('progress attention uses the authoritative read model only for needs_attention', async () => {
  const notificationOriginals = preserve(notificationService, [
    'getNotificationPreferences',
    'createNotification',
  ]);
  const goalOriginals = preserve(studyGoalService, ['getGoalWithProgressForStudent']);
  let readArgs;
  let created;
  notificationService.getNotificationPreferences = async () => ({ riskAlerts: true });
  notificationService.createNotification = async (event) => {
    created = event;
    return { created: true };
  };
  studyGoalService.getGoalWithProgressForStudent = async (...args) => {
    readArgs = args;
    return { progress: { status: 'needs_attention' } };
  };

  try {
    await goalNotificationService.notifyProgressAttention({
      userId: 5,
      studentId: 42,
      goalId: 8,
      checkInId: 99,
      eventVersion: 2,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    assert.equal(readArgs[0], 42);
    assert.equal(readArgs[1], 8);
    assert.deepEqual(created, {
      userId: 5,
      type: 'progress_attention',
      metadata: {
        goalId: 8,
        checkinId: 99,
        progressStatus: 'needs_attention',
        eventVersion: 2,
      },
    });

    for (const status of ['on_track', 'insufficient_data', 'overdue', 'completed']) {
      created = null;
      studyGoalService.getGoalWithProgressForStudent = async () => ({ progress: { status } });
      const result = await goalNotificationService.notifyProgressAttention({
        userId: 5, studentId: 42, goalId: 8, checkInId: 99, eventVersion: 2,
      });
      assert.equal(result.skipped, 'status_not_notifiable');
      assert.equal(created, null);
    }
  } finally {
    Object.assign(notificationService, notificationOriginals);
    Object.assign(studyGoalService, goalOriginals);
  }
});

test('student reminder sync is bounded, UTC-safe, and does not read progress histories', async () => {
  const notificationOriginals = preserve(notificationService, [
    'getNotificationPreferences',
    'createNotification',
  ]);
  const goalOriginals = preserve(studyGoalService, [
    'getActiveGoalReminderCandidates',
    'getCheckInByGoalAndWeek',
    'getCheckInsByGoal',
    'getGoalWithProgressForStudent',
  ]);
  let candidateArgs;
  const weekCalls = [];
  const created = [];
  notificationService.getNotificationPreferences = async (userId) => {
    assert.equal(userId, 5);
    return { goalReminders: true, checkinReminders: true };
  };
  notificationService.createNotification = async (event) => {
    created.push(event);
    return { created: true };
  };
  studyGoalService.getActiveGoalReminderCandidates = async (...args) => {
    candidateArgs = args;
    return [
      { id: 1, deadline: '2026-09-01' },
      { id: 2, deadline: '2026-09-15' },
      { id: 3, deadline: '2026-08-24' },
      ...Array.from({ length: 8 }, (_, index) => ({ id: index + 4, deadline: null })),
    ];
  };
  studyGoalService.getCheckInByGoalAndWeek = async (...args) => {
    weekCalls.push(args);
    return args[0] === 2 ? { id: 200 } : null;
  };
  studyGoalService.getCheckInsByGoal = async () => {
    throw new Error('sync must not scan check-in histories');
  };
  studyGoalService.getGoalWithProgressForStudent = async () => {
    throw new Error('sync must not use the progress read model');
  };

  try {
    const summary = await goalNotificationService.syncStudentGoalReminders({
      userId: 5,
      studentId: 42,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    assert.deepEqual(candidateArgs, [42, { limit: 11 }]);
    assert.equal(summary.processedGoals, 10);
    assert.equal(summary.truncated, true);
    assert.equal(summary.deadlineNotifications, 1);
    assert.equal(summary.checkInNotifications, 9);
    assert.equal(weekCalls.length, 10);
    assert.ok(weekCalls.every(([, weekStart]) => weekStart === '2026-08-24'));
    assert.deepEqual(created[0], {
      userId: 5,
      type: 'goal_deadline',
      metadata: { goalId: 1, deadline: '2026-09-01' },
    });
    assert.equal(created.some((event) => event.metadata.goalId === 11), false);
  } finally {
    Object.assign(notificationService, notificationOriginals);
    Object.assign(studyGoalService, goalOriginals);
  }
});

test('repeat reminder synchronization uses the same idempotent notification identities', async () => {
  const notificationOriginals = preserve(notificationService, [
    'getNotificationPreferences',
    'createNotification',
  ]);
  const goalOriginals = preserve(studyGoalService, [
    'getActiveGoalReminderCandidates',
    'getCheckInByGoalAndWeek',
  ]);
  const dedupeKeys = new Set();
  const events = [];
  notificationService.getNotificationPreferences = async () => ({
    goalReminders: true,
    checkinReminders: true,
  });
  notificationService.createNotification = async (event) => {
    const key = JSON.stringify(event);
    const created = !dedupeKeys.has(key);
    dedupeKeys.add(key);
    events.push(event);
    return { created };
  };
  studyGoalService.getActiveGoalReminderCandidates = async () => [
    { id: 8, deadline: '2026-08-26' },
  ];
  studyGoalService.getCheckInByGoalAndWeek = async () => null;

  try {
    const first = await goalNotificationService.syncStudentGoalReminders({
      userId: 5, studentId: 42, now: new Date('2026-08-25T12:00:00.000Z'),
    });
    const duplicate = await goalNotificationService.syncStudentGoalReminders({
      userId: 5, studentId: 42, now: new Date('2026-08-25T12:00:00.000Z'),
    });

    assert.deepEqual(
      [first.deadlineNotifications, first.checkInNotifications],
      [1, 1]
    );
    assert.deepEqual(
      [duplicate.deadlineNotifications, duplicate.checkInNotifications],
      [0, 0]
    );
    assert.deepEqual(events.slice(0, 2), events.slice(2));
  } finally {
    Object.assign(notificationService, notificationOriginals);
    Object.assign(studyGoalService, goalOriginals);
  }
});

test('student reminder sync does not query goals when both reminder preferences are disabled', async () => {
  const notificationOriginals = preserve(notificationService, ['getNotificationPreferences']);
  const goalOriginals = preserve(studyGoalService, ['getActiveGoalReminderCandidates']);
  let candidatesRead = false;
  notificationService.getNotificationPreferences = async () => ({
    goalReminders: false,
    checkinReminders: false,
  });
  studyGoalService.getActiveGoalReminderCandidates = async () => {
    candidatesRead = true;
    return [];
  };

  try {
    const summary = await goalNotificationService.syncStudentGoalReminders({
      userId: 5,
      studentId: 42,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    assert.equal(summary.processedGoals, 0);
    assert.equal(candidatesRead, false);
  } finally {
    Object.assign(notificationService, notificationOriginals);
    Object.assign(studyGoalService, goalOriginals);
  }
});
