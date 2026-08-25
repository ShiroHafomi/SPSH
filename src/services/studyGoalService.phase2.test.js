'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../config/db');
const studyGoalService = require('./studyGoalService');

const originalPoolQuery = pool.query;

test.afterEach(() => {
  pool.query = originalPoolQuery;
});

test('staff goal lookup binds both goal and student IDs', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [[{ id: 8, student_id: 42 }]];
  };

  const goal = await studyGoalService.getGoalByIdForStudent(8, 42);

  assert.equal(goal.id, 8);
  assert.match(call.sql, /id = \? AND student_id = \?/i);
  assert.deepEqual(call.params, [8, 42]);
});

test('teacher feedback update binds feedback and the full resource relationship', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [{ affectedRows: 1 }];
  };

  const updated = await studyGoalService.updateTeacherFeedbackForGoal(
    99,
    8,
    42,
    'Focus on the next practice set.'
  );

  assert.equal(updated, true);
  assert.match(call.sql, /INNER JOIN study_goals/i);
  assert.match(call.sql, /teacher_feedback = \?/i);
  assert.deepEqual(call.params, [
    'Focus on the next practice set.',
    99,
    8,
    42,
  ]);
});

test('staff check-in lookup uses goal and student relationship in SQL', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [[]];
  };

  const checkIn = await studyGoalService.getCheckInByIdForGoalAndStudent(99, 8, 42);

  assert.equal(checkIn, null);
  assert.match(call.sql, /weekly_checkins\.goal_id = \?/i);
  assert.match(call.sql, /study_goals\.student_id = \?/i);
  assert.deepEqual(call.params, [99, 8, 42]);
});

test('admin goal pagination binds student ID, size, and offset', async () => {
  let pageCall;
  let countCall;
  pool.query = async (sql, params) => {
    if (/COUNT\(\*\)/i.test(sql)) {
      countCall = { sql, params };
      return [[{ total: 2 }]];
    }
    pageCall = { sql, params };
    return [[{ id: 8, student_id: 42 }]];
  };

  const goals = await studyGoalService.getGoalsByStudentPage(42, { size: 20, offset: 40 });
  const total = await studyGoalService.countGoalsByStudent(42);

  assert.equal(goals.length, 1);
  assert.equal(total, 2);
  assert.match(pageCall.sql, /LIMIT \? OFFSET \?/i);
  assert.deepEqual(pageCall.params, [42, 20, 40]);
  assert.deepEqual(countCall.params, [42]);
});

test('weekly check-in initialization upgrades existing tables with a notification revision', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return [{}];
  };

  await studyGoalService.ensureWeeklyCheckinsTable();

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /notification_revision INT UNSIGNED NOT NULL DEFAULT 1/i);
  assert.match(calls[1].sql, /ALTER TABLE weekly_checkins/i);
  assert.match(calls[1].sql, /ADD COLUMN IF NOT EXISTS notification_revision/i);
});

test('check-in updates increment the persisted notification revision', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [{ affectedRows: 1 }];
  };

  const updated = await studyGoalService.updateCheckIn(99, { studyHours: 8 });

  assert.equal(updated, true);
  assert.match(call.sql, /study_hours = \?/i);
  assert.match(call.sql, /notification_revision = notification_revision \+ 1/i);
  assert.deepEqual(call.params, [8, 99]);
});

test('teacher feedback outcome increments revisions only for changed feedback and reloads the scoped row', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/UPDATE weekly_checkins/i.test(sql)) return [{ affectedRows: 1 }];
    return [[{ id: 99, goal_id: 8, notification_revision: 3, teacher_feedback: 'Fresh feedback' }]];
  };

  const outcome = await studyGoalService.updateTeacherFeedbackWithOutcome(
    99,
    8,
    42,
    'Fresh feedback'
  );

  assert.equal(outcome.changed, true);
  assert.equal(outcome.checkIn.notification_revision, 3);
  assert.match(calls[0].sql, /teacher_feedback = \?/i);
  assert.match(calls[0].sql, /notification_revision = weekly_checkins\.notification_revision \+ 1/i);
  assert.match(calls[0].sql, /NOT \(weekly_checkins\.teacher_feedback <=> \?\)/i);
  assert.deepEqual(calls[0].params, ['Fresh feedback', 99, 8, 42, 'Fresh feedback']);
  assert.match(calls[1].sql, /weekly_checkins\.id = \?/i);
  assert.deepEqual(calls[1].params, [99, 8, 42]);
});

test('active reminder candidate query is parameterized, ordered, and bounded', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [[{ id: 8, student_id: 42, deadline: '2026-08-26' }]];
  };

  const goals = await studyGoalService.getActiveGoalReminderCandidates(42, { limit: 11 });

  assert.equal(goals.length, 1);
  assert.match(call.sql, /WHERE student_id = \? AND status = 'active'/i);
  assert.match(call.sql, /ORDER BY deadline IS NULL ASC, deadline ASC, id ASC/i);
  assert.match(call.sql, /LIMIT \?/i);
  assert.deepEqual(call.params, [42, 11]);
});
