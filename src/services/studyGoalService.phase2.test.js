'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../config/db');
const studyGoalService = require('./studyGoalService');

const originalPoolQuery = pool.query;
const originalGetConnection = pool.getConnection;

test.afterEach(() => {
  pool.query = originalPoolQuery;
  pool.getConnection = originalGetConnection;
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

test('goal and check-in validation reject impossible calendar dates', () => {
  assert.deepEqual(studyGoalService.validateGoalData({
    deadline: '2026-02-29',
    status: 'active',
  }), ['deadline must be a valid date.']);

  assert.deepEqual(studyGoalService.validateGoalData({ status: null }), [
    'status must be one of: active, completed, paused, cancelled.',
  ]);

  assert.deepEqual(studyGoalService.validateCheckInData({
    studyHours: 8,
    sleepHours: 7,
    attendancePercent: 95,
    weekStart: '2026-02-29',
  }), ['week_start must be a valid date.']);
});

test('check-in updates persist a changed week start and nullable score', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [{ affectedRows: 1 }];
  };

  const updated = await studyGoalService.updateCheckIn(99, {
    weekStart: '2026-08-24',
    currentScore: null,
  });

  assert.equal(updated, true);
  assert.match(call.sql, /current_score = \?/i);
  assert.match(call.sql, /week_start = \?/i);
  assert.deepEqual(call.params, [null, '2026-08-24', 99]);
});

test('active goal creation serializes the active-goal check inside a transaction', async () => {
  const calls = [];
  let committed = false;
  let released = false;
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (/status = 'active'/i.test(sql)) return [[]];
      if (/INSERT INTO study_goals/i.test(sql)) return [{ insertId: 8 }];
      return [[]];
    },
    async commit() { committed = true; },
    async rollback() { throw new Error('rollback should not run'); },
    release() { released = true; },
  };
  pool.getConnection = async () => connection;

  const goal = await studyGoalService.createGoalForStudent({
    studentId: 42,
    targetScore: 90,
    targetGrade: 'A',
    targetStudyHours: 10,
    targetAttendance: 95,
    deadline: '2026-09-30',
    status: 'active',
  });

  assert.equal(goal.id, 8);
  assert.equal(committed, true);
  assert.equal(released, true);
  assert.match(calls[1].sql, /FROM students WHERE id = \? FOR UPDATE/i);
  assert.match(calls[2].sql, /FROM study_goals WHERE student_id = \? AND status = 'active'/i);
});

test('active status transitions reject a second active goal and roll back', async () => {
  let rolledBack = false;
  let released = false;
  const connection = {
    async beginTransaction() {},
    async query(sql) {
      if (/FROM students WHERE id = \? FOR UPDATE/i.test(sql)) return [[]];
      if (/SELECT id, status FROM study_goals/i.test(sql)) return [[{ id: 8, status: 'paused' }]];
      if (/status = 'active' AND id <> \?/i.test(sql)) return [[{ id: 9 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async commit() { throw new Error('commit should not run'); },
    async rollback() { rolledBack = true; },
    release() { released = true; },
  };
  pool.getConnection = async () => connection;

  await assert.rejects(
    () => studyGoalService.updateGoalForStudent(42, 8, { status: 'active' }),
    { code: 'ACTIVE_GOAL_EXISTS' }
  );

  assert.equal(rolledBack, true);
  assert.equal(released, true);
});
