import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardResource } from './dashboardResource.js';
import {
  deriveOpenAssignments,
  deriveActiveSupportPlans,
  deriveActiveGoals,
  normalizeJournalPreviews,
  normalizeAssignmentOverview,
  formatAssignmentDue,
} from './dashboard.js';

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('createDashboardResource deduplicates concurrent refreshes', async () => {
  let calls = 0;
  const resource = createDashboardResource(async () => {
    calls += 1;
    await tick();
    return { ok: true };
  });

  resource.resume();
  const first = resource.refresh();
  const second = resource.refresh();
  assert.equal(first, second, 'concurrent refresh returns the same in-flight promise');
  await first;
  assert.equal(calls, 1, 'only one transport issued despite two refresh calls');
  resource.dispose();
});

test('createDashboardResource defers load across a StrictMode mount/cleanup replay', async () => {
  let calls = 0;
  const resource = createDashboardResource(async () => {
    calls += 1;
    return { ok: true };
  });

  resource.resume();
  resource.dispose(); // StrictMode cleanup before the deferred transport runs
  await tick();
  assert.equal(calls, 0, 'disposed resource never issues transport');
  assert.equal(resource.getSnapshot().loading, false);
});

test('createDashboardResource invalidates stale responses after dispose', async () => {
  let resolveLoad;
  const resource = createDashboardResource(() => new Promise((resolve) => { resolveLoad = resolve; }));

  const promise = resource.resume();
  resource.dispose();
  resolveLoad({ ok: 'stale' });
  await promise;
  assert.equal(resource.getSnapshot().data, null, 'stale response does not repopulate a disposed resource');
});

test('createDashboardResource surfaces a failure as a bounded error state', async () => {
  const resource = createDashboardResource(async () => {
    throw Object.assign(new Error('boom'), { status: 503 });
  });
  await resource.resume();
  assert.equal(resource.getSnapshot().error, 503);
  assert.equal(resource.getSnapshot().loading, false);
  resource.dispose();
});

test('deriveOpenAssignments orders by due date with overdue first and ignores done', () => {
  const assignments = [
    { id: 1, status: 'done', due_at: '2026-01-01T00:00:00Z' },
    { id: 2, status: 'todo', due_at: '2026-03-10T00:00:00Z' },
    { id: 3, status: 'in_progress', due_at: '2026-03-05T00:00:00Z' },
    { id: 4, status: 'todo', due_at: 'not-a-date' },
  ];
  const open = deriveOpenAssignments(assignments);
  assert.deepEqual(open.map((a) => a.id), [3, 2, 4], 'open items sorted by due date, malformed last');
});

test('normalizeAssignmentOverview keeps server summary counts finite', () => {
  const overview = normalizeAssignmentOverview({
    assignments: [{ id: 1, status: 'todo', due_at: '2026-03-05T00:00:00Z' }],
    summary: { todo: 4, inProgress: 2, done: 1, overdue: 1 },
    pagination: { page: 1, size: 8, total: 7, totalPages: 1 },
  });
  assert.deepEqual(overview.summary, { todo: 4, inProgress: 2, done: 1, overdue: 1 });
  assert.equal(overview.assignments.length, 1);
});

test('normalizeJournalPreviews reduces entries and tolerates malformed rows', () => {
  const previews = normalizeJournalPreviews({
    entries: [
      { id: 1, title: 'Limits', entry_date: '2026-03-01', understanding_rating: 4, learned_preview: 'x' },
      { id: null, title: 5, entry_date: 'bad' },
    ],
  });
  assert.equal(previews.length, 2);
  assert.equal(previews[0].title, 'Limits');
  assert.equal(previews[1].title, '', 'non-string title coerced to empty string');
});

test('deriveActiveSupportPlans and deriveActiveGoals filter by status', () => {
  assert.deepEqual(
    deriveActiveSupportPlans({ plans: [{ id: 1, status: 'active' }, { id: 2, status: 'draft' }] }).map((p) => p.id),
    [1]
  );

  const goals = deriveActiveGoals([
    { goal: { id: 1, status: 'active', target_grade: null }, progress: {}, checkIns: [] },
    { goal: { id: 2, status: 'completed', target_grade: null }, progress: {}, checkIns: [] },
  ]);
  assert.deepEqual(goals.map((g) => g.goal.id), [1]);
});

test('formatAssignmentDue never emits NaN or undefined', () => {
  assert.equal(formatAssignmentDue('not-a-date', 'UTC'), '—');
  const formatted = formatAssignmentDue('2026-03-10T00:00:00Z', 'UTC', 'en-US');
  assert.ok(typeof formatted === 'string' && formatted.length > 0);
});