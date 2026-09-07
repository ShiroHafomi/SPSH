import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInterventionRequester,
  getInterventionErrorKey,
  getInterventionNote,
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
  assert.equal(isPositiveIntegerId('9007199254740992'), false);
  assert.equal(isPositiveIntegerId(String(Number.MAX_SAFE_INTEGER)), true);
});

test('intervention response parsing supports the backend contract and legacy spelling', () => {
  assert.equal(getInterventionNote({ interventionNote: ' Full note ' }), 'Full note');
  assert.equal(getInterventionNote({ intervention_note: 'Legacy note' }), 'Legacy note');
  for (const response of [null, [], {}, { interventionNote: 42 }, { interventionNote: ' ' }, { interventionNote: 'x'.repeat(16001) }]) {
    assert.equal(getInterventionNote(response), '');
  }
});

test('intervention errors use status-specific translation keys, not raw backend details', () => {
  const expected = {
    401: 'interventionPermissionDenied', 403: 'interventionPermissionDenied',
    404: 'interventionStudentNotFound', 422: 'interventionInsufficientData',
    429: 'interventionUnavailable', 503: 'interventionUnavailable', 500: 'interventionUnexpectedError',
  };
  for (const [status, key] of Object.entries(expected)) {
    assert.equal(getInterventionErrorKey({ status: Number(status), message: 'SQL secret private stack' }), `admin.${key}`);
  }
  assert.equal(getInterventionErrorKey(new Error('Network')), 'admin.interventionUnexpectedError');
});

test('repeated intervention actions coalesce to one POST with no body identity', async () => {
  const calls = [];
  let finish;
  const requester = createInterventionRequester({ post: (...args) => {
    calls.push(args);
    return new Promise(resolve => { finish = resolve; });
  } });
  const first = requester.generate(' 2 ');
  const second = requester.generate('2');
  assert.equal(first, second);
  await Promise.resolve();
  assert.deepEqual(calls, [['/admin/students/2/intervention']]);
  finish({ interventionNote: 'Note' });
  assert.equal((await first).interventionNote, 'Note');
});

test('intervention retries after a rejected request and rejects invalid IDs without a call', async () => {
  let calls = 0;
  const requester = createInterventionRequester({ post: async path => {
    assert.equal(path, '/admin/students/1/intervention');
    if (++calls === 1) throw new Error('Unavailable');
    return { interventionNote: 'Recovered' };
  } });
  await assert.rejects(requester.generate('1'), /Unavailable/);
  assert.equal((await requester.generate('1')).interventionNote, 'Recovered');
  await assert.rejects(requester.generate('9007199254740992'), RangeError);
  assert.equal(calls, 2);
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
