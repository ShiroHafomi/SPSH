import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAdminMetric,
  getStudentFromDetailsResponse,
  isPositiveIntegerId,
} from './adminAiTools.js';

test('admin AI tools accept only positive numeric database IDs', () => {
  assert.equal(isPositiveIntegerId('42'), true);
  assert.equal(isPositiveIntegerId(' 7 '), true);
  assert.equal(isPositiveIntegerId('STU001'), false);
  assert.equal(isPositiveIntegerId('0'), false);
  assert.equal(isPositiveIntegerId('1.5'), false);
  assert.equal(isPositiveIntegerId(null), false);
});

test('admin metric formatting preserves zero and suppresses missing values', () => {
  assert.equal(formatAdminMetric(0, 1, '%'), '0.0%');
  assert.equal(formatAdminMetric('3.25', 2), '3.25');
  assert.equal(formatAdminMetric(null, 1, '%'), '—');
  assert.equal(formatAdminMetric('', 1), '—');
  assert.equal(formatAdminMetric(Number.NaN, 1), '—');
});

test('student details unwrap only the established response shape', () => {
  const student = { id: 42, name: 'Student' };
  assert.equal(getStudentFromDetailsResponse({ student }), student);
  assert.equal(getStudentFromDetailsResponse(student), null);
  assert.equal(getStudentFromDetailsResponse({ student: [] }), null);
  assert.equal(getStudentFromDetailsResponse(null), null);
});
