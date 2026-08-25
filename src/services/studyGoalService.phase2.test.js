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
