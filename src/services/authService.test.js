'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../config/db');
const authService = require('./authService');

const originalPoolQuery = pool.query;

test.afterEach(() => {
  pool.query = originalPoolQuery;
});

test('unique active student recipient lookup selects only an ID with bounded parameterized SQL', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [[{ id: 5 }]];
  };

  const userId = await authService.findUniqueActiveStudentUserId(42);

  assert.equal(userId, 5);
  assert.match(call.sql, /^\s*SELECT id\s+FROM users/im);
  assert.match(call.sql, /student_id = \? AND role = \? AND is_active = \?/i);
  assert.match(call.sql, /ORDER BY id ASC\s+LIMIT 2/i);
  assert.doesNotMatch(call.sql, /email|name|password|department/i);
  assert.deepEqual(call.params, [42, 'student', 1]);
});

test('unique active student recipient lookup suppresses zero, ambiguous, and malformed mappings', async () => {
  const cases = [
    { rows: [], expected: null },
    { rows: [{ id: 5 }, { id: 6 }], expected: null },
    { rows: [{ id: 0 }], expected: null },
  ];

  for (const { rows, expected } of cases) {
    pool.query = async () => [rows];
    assert.equal(await authService.findUniqueActiveStudentUserId(42), expected);
  }

  let calls = 0;
  pool.query = async () => { calls += 1; };
  assert.equal(await authService.findUniqueActiveStudentUserId('42bad'), null);
  assert.equal(calls, 0);
});
