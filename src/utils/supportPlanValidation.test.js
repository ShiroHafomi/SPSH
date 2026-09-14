'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  positiveId, validateDraft, validateTaskUpdate, validateTransition, validateList, calendarDate, progress,
} = require('./supportPlanValidation');

const draft = (patch = {}) => ({
  title: ' Weekly support ', objective: ' Build a consistent routine ',
  start_date: '2026-09-01', due_date: '2026-09-30',
  tasks: [{ title: ' Review notes ', description: ' In short sessions ', due_date: '2026-09-15' }],
  ...patch,
});
const bad = fn => assert.throws(fn, error => error.status === 400 && error.code.startsWith('SUPPORT_PLAN_'));

test('support draft validation trims and bounds all content', () => {
  const result = validateDraft(draft());
  assert.equal(result.title, 'Weekly support');
  assert.equal(result.objective, 'Build a consistent routine');
  assert.equal(result.tasks[0].title, 'Review notes');
  assert.equal(result.tasks[0].description, 'In short sessions');
  assert.equal(validateDraft(draft({ tasks: [] })).tasks.length, 0);
  for (const [field, length] of [['title', 150], ['objective', 2000]]) {
    assert.equal(validateDraft(draft({ [field]: 'a'.repeat(length) }))[field].length, length);
    bad(() => validateDraft(draft({ [field]: 'a'.repeat(length + 1) })));
    bad(() => validateDraft(draft({ [field]: '  ' })));
  }
  for (const task of [{ title: 'a'.repeat(151) }, { title: 'x', description: 'a'.repeat(1001) }, { title: '' }]) {
    bad(() => validateDraft(draft({ tasks: [task] })));
  }
  const task = { title: 'Task', description: 'a'.repeat(1000) };
  assert.equal(validateDraft(draft({ tasks: Array.from({ length: 20 }, () => task) })).tasks.length, 20);
  bad(() => validateDraft(draft({ tasks: Array.from({ length: 21 }, () => task) })));
});

test('support drafts reject ownership, lifecycle and unknown writable fields', () => {
  for (const field of ['student_id', 'created_by_user_id', 'role', 'status', 'id', 'version', 'extra']) {
    bad(() => validateDraft(draft({ [field]: 1 })));
  }
  for (const field of ['plan_id', 'id', 'version', 'status', 'sort_order', 'completed_at']) {
    bad(() => validateDraft(draft({ tasks: [{ title: 'Task', [field]: 1 }] })));
  }
  for (const value of [null, [], 'text', false]) bad(() => validateDraft(value));
  bad(() => validateDraft(draft({ title: `hidden${String.fromCharCode(0)}data` })));
});

test('support plan IDs and versions are positive safe integers', () => {
  assert.equal(positiveId('123'), 123);
  for (const id of [0, -1, 1.5, '1e2', '0x10', '1junk', Number.MAX_SAFE_INTEGER + 1, null, true, [], {}]) bad(() => positiveId(id));
  assert.equal(validateDraft(draft({ version: 2 }), { edit: true }).version, 2);
  bad(() => validateDraft(draft(), { edit: true }));
  assert.deepEqual(validateTransition({ version: 3 }), { version: 3 });
  bad(() => validateTransition({ version: 1, status: 'active' }));
});

test('support dates must be real MySQL calendar dates with valid ranges', () => {
  assert.equal(calendarDate('2024-02-29'), '2024-02-29');
  for (const date of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01', '0999-01-01', '2026-9-01', '2026-09-01T00:00:00Z', 123, null]) {
    bad(() => calendarDate(date));
  }
  bad(() => validateDraft(draft({ start_date: '2026-10-01' })));
  for (const due_date of ['2026-08-31', '2026-10-01']) bad(() => validateDraft(draft({ tasks: [{ title: 'Task', due_date }] })));
  for (const due_date of ['2026-09-01', '2026-09-30', null]) assert.equal(validateDraft(draft({ tasks: [{ title: 'Task', due_date }] })).tasks[0].due_date, due_date);
});

test('support task mutation accepts only status and current versions', () => {
  for (const status of ['pending', 'in_progress', 'completed']) {
    assert.deepEqual(validateTaskUpdate({ status, version: 2, planVersion: 3 }), { status, version: 2, planVersion: 3 });
  }
  for (const patch of [{ status: 'done' }, { version: 0 }, { planVersion: undefined }, { title: 'Changed' }, { student_id: 1 }]) {
    bad(() => validateTaskUpdate({ status: 'completed', version: 1, planVersion: 1, ...patch }));
  }
});

test('support pagination and filters are bounded and allowlisted', () => {
  assert.deepEqual(validateList(), { page: 1, size: 20, status: null });
  assert.deepEqual(validateList({ page: '2', size: '100', status: 'active' }), { page: 2, size: 100, status: 'active' });
  for (const query of [{ size: 101 }, { page: 0 }, { page: Number.MAX_SAFE_INTEGER, size: 100 }, { status: 'unknown' }, { sort: 'title DESC' }, { studentId: 1 }]) bad(() => validateList(query));
});

test('support progress is finite and never automatically completes a plan', () => {
  const plan = { status: 'draft', due_date: '2026-09-01' };
  assert.deepEqual(progress(plan, 0, 0), { totalTaskCount: 0, completedTaskCount: 0, progressPercent: 0, isOverdue: false });
  const active = { ...plan, status: 'active' };
  assert.ok(Math.abs(progress(active, 3, 1).progressPercent - 100 / 3) < 0.000001);
  assert.equal(progress(active, 2, 2).progressPercent, 100);
  assert.equal(progress(active, 2, 2).isOverdue, false);
  assert.equal(active.status, 'active');
  for (const counts of [[NaN, 0], [2, Infinity], [2, 3], [21, 1], [-1, 0]]) assert.throws(() => progress(active, ...counts));
});

test('support overdue begins after the complete UTC deadline day', () => {
  const plan = { status: 'active', due_date: '2026-09-08' };
  assert.equal(progress(plan, 2, 1, new Date('2026-09-08T23:59:59.999Z')).isOverdue, false);
  assert.equal(progress(plan, 2, 1, new Date('2026-09-09T00:00:00.000Z')).isOverdue, true);
  for (const status of ['draft', 'completed', 'cancelled']) assert.equal(progress({ ...plan, status }, 2, 1, new Date('2026-09-10')).isOverdue, false);
});
