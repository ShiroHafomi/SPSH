import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayAdminUserText,
  formatAdminUserDate,
  normalizeAdminUsersResponse,
  positiveAdminUserId,
} from './adminUsers.js';

test('admin user identifiers accept only positive safe integers', () => {
  assert.equal(positiveAdminUserId(42), 42);
  assert.equal(positiveAdminUserId('7'), 7);
  assert.equal(positiveAdminUserId('../users'), null);
  assert.equal(positiveAdminUserId('1e2'), null);
  assert.equal(positiveAdminUserId('0x10'), null);
  assert.equal(positiveAdminUserId(1.5), null);
  assert.equal(positiveAdminUserId(true), null);
  assert.equal(positiveAdminUserId(Number.MAX_SAFE_INTEGER + 1), null);
});

test('admin user display formatters suppress malformed values', () => {
  assert.equal(displayAdminUserText('Ada'), 'Ada');
  assert.equal(displayAdminUserText(12), '12');
  assert.equal(displayAdminUserText({ name: 'Ada' }), '—');
  assert.equal(displayAdminUserText(Number.POSITIVE_INFINITY), '—');
  assert.equal(formatAdminUserDate('not-a-date'), '—');
  assert.equal(formatAdminUserDate(true), '—');
  assert.match(formatAdminUserDate('2026-09-04T12:00:00Z', 'en'), /2026/);
});

test('admin user list normalization derives bounded API pagination', () => {
  const response = normalizeAdminUsersResponse({
    users: [{ id: 1 }, null, 'invalid', { id: 2 }],
    total: '41',
    totalPages: 999,
  }, 99, 20);

  assert.deepEqual(response.users, [{ id: 1 }, { id: 2 }]);
  assert.equal(response.total, 41);
  assert.equal(response.totalPages, 3);
  assert.equal(response.page, 3);
});

test('admin user list normalization remains finite for malformed responses', () => {
  assert.deepEqual(normalizeAdminUsersResponse(null, Number.POSITIVE_INFINITY), {
    users: [],
    total: 0,
    totalPages: 1,
    page: 1,
  });
  assert.equal(normalizeAdminUsersResponse({ users: [{ id: 1 }], total: null }).total, 1);
});
