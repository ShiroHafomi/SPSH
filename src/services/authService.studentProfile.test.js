'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const {
  updateOwnStudentProfile,
  validateProfileName,
  validateProfilePassword,
} = require('./authService');

function studentRow(password) {
  return {
    id: 7,
    email: 'student@example.com',
    name: 'Old Name',
    role: 'student',
    student_id: 42,
    department: null,
    is_active: 1,
    password_hash: password,
  };
}

test('student profile validators reject invalid names and passwords', () => {
  assert.throws(() => validateProfileName(' '), /between 2 and 100/);
  assert.throws(() => validateProfileName('<script>'), /invalid characters/);
  assert.throws(() => validateProfilePassword('short1A'), /at least 8/);
  assert.throws(() => validateProfilePassword('lowercase1'), /uppercase/);
  assert.throws(() => validateProfilePassword('UPPERCASE1'), /lowercase/);
  assert.throws(() => validateProfilePassword('ValidPassword'), /number/);
});

test('updateOwnStudentProfile updates only the authenticated student name', async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id, email')) return [[studentRow('hash')]];
    return [{ affectedRows: 1 }];
  };
  try {
    const user = await updateOwnStudentProfile(7, { name: 'Nguyễn An' });
    assert.equal(user.name, 'Nguyễn An');
    assert.equal(user.role, 'student');
    assert.equal('password_hash' in user, false);
    assert.match(calls[0].sql, /id = \? AND role = \?/);
    assert.deepEqual(calls[0].params, [7, 'student']);
    assert.match(calls[1].sql, /name = \?/);
  } finally {
    pool.query = originalQuery;
  }
});

test('updateOwnStudentProfile verifies the current password before hashing a new one', async () => {
  const originalQuery = pool.query;
  const hash = await bcrypt.hash('CorrectPassword1', 4);
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id, email')) return [[studentRow(hash)]];
    return [{ affectedRows: 1 }];
  };
  try {
    await assert.rejects(
      updateOwnStudentProfile(7, { currentPassword: 'WrongPassword1', newPassword: 'NewPassword1' }),
      (error) => error.code === 'INVALID_CURRENT_PASSWORD'
    );
    assert.equal(calls.length, 1);

    const user = await updateOwnStudentProfile(7, { currentPassword: 'CorrectPassword1', newPassword: 'NewPassword1' });
    assert.equal(user.id, 7);
    assert.equal('password_hash' in user, false);
    assert.equal(calls.length, 4);
    assert.match(calls[2].sql, /UPDATE users SET password_hash = \?/);
    assert.match(calls[3].sql, /UPDATE auth_sessions/);
  } finally {
    pool.query = originalQuery;
  }
});

test('updateOwnStudentProfile cannot update a non-student account', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[]];
  try {
    assert.equal(await updateOwnStudentProfile(8, { name: 'Someone Else' }), null);
  } finally {
    pool.query = originalQuery;
  }
});
