'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../services/authService');
const { pool } = require('../config/db');
const {
  apiCreateUser,
  apiListUsers,
} = require('./adminController');

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

test('apiListUsers includes admin accounts when no role filter is supplied', async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    if (calls.length === 1) {
      return [[{
        id: 1,
        email: 'admin@example.test',
        name: 'Admin',
        role: 'admin',
      }]];
    }
    return [[{ total: 1 }]];
  };

  try {
    const req = { query: {} };
    const res = createResponse();
    await apiListUsers(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.totalPages, 1);
    assert.equal(res.body.users[0].role, 'admin');
    assert.doesNotMatch(calls[0].sql, /role\s*!=/i);
    assert.deepEqual(calls[0].values, [20, 0]);
    assert.deepEqual(calls[1].values, []);
  } finally {
    pool.query = originalQuery;
  }
});

test('apiCreateUser returns a conflict when insertion loses an email uniqueness race', async () => {
  const originalEmailExists = authService.emailExists;
  const originalCreateUser = authService.createUser;

  authService.emailExists = async () => false;
  authService.createUser = async () => {
    const error = new Error('Duplicate entry');
    error.code = 'ER_DUP_ENTRY';
    throw error;
  };

  try {
    const req = {
      body: {
        name: 'New Admin',
        email: 'new-admin@example.test',
        password: 'SecurePass1',
        role: 'admin',
      },
      user: { id: 1 },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();
    await apiCreateUser(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: 'Email already registered.' });
  } finally {
    authService.emailExists = originalEmailExists;
    authService.createUser = originalCreateUser;
  }
});
