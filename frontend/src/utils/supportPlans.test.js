import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canComplete, canEditTasks, createSupportPlanStore, draftError, draftPayload, editableDraft,
  emptyDraft, prefillIntervention, supportError, supportPlanBase, taskPayload } from './supportPlans.js';
import { getNavigationForRole } from '../components/appShell.js';
import { getNotificationPresentation, resolveNotificationDestination } from './notifications.js';

const draft = () => ({ ...emptyDraft(new Date('2026-09-01T12:00:00Z')), title: ' Review ', objective: ' Practice ',
  tasks: [{ title: ' Recall ', description: ' Brief sessions ', due_date: '' }] });
const plan = (patch = {}) => ({ ...draftPayload(draft()), id: 1, version: 2, status: 'active', totalTaskCount: 1,
  completedTaskCount: 0, progressPercent: 0, isOverdue: false,
  tasks: [{ id: 5, title: 'Recall', description: '', due_date: null, status: 'pending', version: 1 }], ...patch });
const page = (plans = [plan()]) => ({ plans, total: plans.length, totalPages: plans.length ? 1 : 0 });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('support form validates bounds and real dates and only serializes editable content', () => {
  assert.equal(draftError(draft()), '');
  assert.deepEqual(draftPayload({ ...draft(), student_id: 99, status: 'active' }), {
    title: 'Review', objective: 'Practice', start_date: '2026-09-01', due_date: '2026-09-15',
    tasks: [{ title: 'Recall', description: 'Brief sessions', due_date: null }],
  });
  for (const patch of [{ title: '' }, { title: 'a'.repeat(151) }, { objective: 'a'.repeat(2001) },
    { tasks: Array(21).fill({ title: 'x' }) }, { tasks: [null] }, { tasks: [{ title: 'x', description: 'a'.repeat(1001) }] },
    { start_date: '2026-02-29' }, { due_date: '2026-08-31' }, { tasks: [{ title: 'x', due_date: '2026-09-16' }] }]) {
    assert.ok(draftError({ ...draft(), ...patch }));
    assert.throws(() => draftPayload({ ...draft(), ...patch }));
  }
  const edited = editableDraft(plan({ status: 'draft' }));
  assert.equal(edited.version, 2);
  assert.equal(edited.tasks[0].id, undefined);
  assert.equal(edited.tasks[0].status, undefined);
  assert.equal(draftPayload(edited).version, 2);
});

test('support prefill copies only bounded recommendation action bullets, never raw metadata', () => {
  const note = 'Student: private\n* not an action\n--- RECOMMENDATIONS ---\n[HIGH] Advice\n  * Review notes\n  * Practice questions\n--- CUSTOM NOTES ---\n* private custom note\n=== END OF NOTE ===';
  const result = prefillIntervention(note, key => key, new Date('2026-09-01'));
  assert.deepEqual(result.tasks.map(task => task.title), ['Review notes', 'Practice questions']);
  assert.equal(result.title, 'supportPlans.suggestedTitle');
  assert.equal(result.objective, 'supportPlans.suggestedObjective');
  assert.equal(result.tasks[0].description, '');
  for (const input of [null, {}, '{"model":"private"}', 'x'.repeat(16001)]) {
    assert.equal(prefillIntervention(input, key => key).tasks.length, 0);
  }
  const long = '--- RECOMMENDATIONS ---\n' + Array(30).fill(`* ${'x'.repeat(170)}`).join('\n');
  const bounded = prefillIntervention(long, key => key);
  assert.equal(bounded.tasks.length, 20);
  assert.ok(bounded.tasks.every(task => task.title.length === 150));
});

test('support roles, navigation, and task payloads do not grant teacher management', () => {
  assert.equal(supportPlanBase('admin', '12'), '/admin/students/12/support-plans');
  assert.equal(supportPlanBase('student', 999), '/student/me/support-plans');
  for (const role of ['teacher', 'user', undefined]) assert.equal(supportPlanBase(role, 12), null);
  for (const id of [null, '1/../../2', 0, Infinity]) assert.equal(supportPlanBase('admin', id), null);
  for (const role of ['admin', 'student']) {
    assert.ok(getNavigationForRole(role).flatMap(group => group.items).some(item => item.to === `/${role}/support-plans`));
  }
  assert.equal(getNavigationForRole('teacher').flatMap(group => group.items).some(item => item.to.includes('support-plans')), false);
  const active = plan();
  assert.deepEqual(taskPayload(active, active.tasks[0], 'completed'), { status: 'completed', version: 1, planVersion: 2 });
  assert.equal(canComplete(active), false);
  assert.equal(canComplete(plan({ completedTaskCount: 1 })), true);
  for (const status of ['draft', 'completed', 'cancelled']) {
    assert.equal(canEditTasks(plan({ status })), false);
    assert.equal(canComplete(plan({ status, completedTaskCount: 1 })), false);
    assert.throws(() => taskPayload(plan({ status }), active.tasks[0], 'completed'));
  }
});

test('activation notification navigates only to student support plans', () => {
  const notification = { type: 'support_plan_activated', titleKey: 'notifications.supportPlanActivated.title',
    messageKey: 'notifications.supportPlanActivated.message', metadata: { planId: 1, studentId: 2, url: 'https://example.com' } };
  assert.ok(getNotificationPresentation(notification));
  assert.equal(resolveNotificationDestination(notification, 'student'), '/student/support-plans');
  for (const role of ['admin', 'teacher', 'user']) assert.equal(resolveNotificationDestination(notification, role), '/notifications');
});

test('support list exposes loading, empty, safe errors and retry recovery', async () => {
  const pending = deferred();
  let failing = false;
  const store = createSupportPlanStore({ get: async () => { if (failing) throw { status: 500, message: 'private SQL' }; return pending.promise; } }, '/base');
  const request = store.loadList();
  assert.equal(store.getSnapshot().listLoading, true);
  pending.resolve(page([])); await request;
  assert.equal(store.getSnapshot().listLoading, false);
  assert.equal(store.getSnapshot().plans.length, 0);
  failing = true; await store.loadList();
  assert.equal(store.getSnapshot().error, 'supportPlans.requestError');
  failing = false; await store.loadList();
  assert.equal(store.getSnapshot().error, '');
  const noScope = createSupportPlanStore({ get: () => assert.fail('No unauthorized request') }, null);
  await noScope.loadList();
  assert.equal(await noScope.mutate('post', '', {}), null);
});

test('support list uses bounded queries, ignores stale responses and clamps empty pages', async () => {
  const first = deferred(), second = deferred();
  const calls = [];
  const store = createSupportPlanStore({ get: url => { calls.push(url); return calls.length === 1 ? first.promise : second.promise; } }, '/base');
  const older = store.loadList(1, 'draft'); const newer = store.loadList(1, 'active');
  second.resolve(page([plan({ id: 2 })])); await newer;
  first.resolve(page()); await older;
  assert.equal(store.getSnapshot().plans[0].id, 2);
  assert.deepEqual(calls, ['/base?page=1&size=20&status=draft', '/base?page=1&size=20&status=active']);
  const clampedCalls = [];
  const clamped = createSupportPlanStore({ get: async url => { clampedCalls.push(url); return page([]); } }, '/base');
  await clamped.loadList(2);
  assert.deepEqual(clampedCalls, ['/base?page=2&size=20', '/base?page=1&size=20']);
  assert.equal(clamped.getSnapshot().page, 1);
});

test('support detail selection and disposal invalidate older requests', async () => {
  const old = deferred();
  const store = createSupportPlanStore({ get: url => url === '/base/1' ? old.promise : Promise.resolve({ plan: plan({ id: 2 }) }) }, '/base');
  const request = store.loadPlan(1);
  assert.equal(store.getSnapshot().detailLoading, true);
  await store.loadPlan(2);
  old.resolve({ plan: plan() }); await request;
  assert.equal(store.getSnapshot().plan.id, 2);
  store.clearPlan(); assert.equal(store.getSnapshot().plan, null);
  store.dispose();
  await store.loadPlan(2);
  assert.equal(store.getSnapshot().plan, null);
});

test('support manual creation, activation, task progress and explicit completion work without generation', async () => {
  const calls = [];
  let current;
  const api = {
    get: async () => page([current]),
    post: async (url, body) => {
      calls.push({ url, body });
      current = url === '/base' ? plan({ status: 'draft', version: 1 }) : plan({ ...current,
        status: url.endsWith('/activate') ? 'active' : 'completed', version: current.version + 1 });
      return { plan: current, warnings: [] };
    },
    patch: async (url, body) => {
      calls.push({ url, body });
      current = plan({ ...current, completedTaskCount: 1, progressPercent: 100, version: 3,
        tasks: [{ ...current.tasks[0], status: 'completed', version: 2 }] });
      return { plan: current };
    },
  };
  const store = createSupportPlanStore(api, '/base');
  await store.mutate('post', '', draftPayload(draft()));
  assert.equal(store.getSnapshot().plan.status, 'draft');
  await store.mutate('post', '/1/activate', { version: 1 });
  await store.mutate('patch', '/1/tasks/5', taskPayload(current, current.tasks[0], 'completed'));
  assert.equal(store.getSnapshot().plan.status, 'active');
  assert.equal(canComplete(store.getSnapshot().plan), true);
  await store.mutate('post', '/1/complete', { version: 3 });
  assert.equal(store.getSnapshot().plan.status, 'completed');
  assert.equal(canEditTasks(store.getSnapshot().plan), false);
  assert.equal(calls.length, 4);
});

test('support failed task update preserves visible status and suppresses duplicate submissions', async () => {
  const pending = deferred(); let calls = 0;
  const store = createSupportPlanStore({ get: async () => ({ plan: plan() }), patch: () => { calls++; return pending.promise; } }, '/base');
  await store.loadPlan(1);
  const request = store.mutate('patch', '/1/tasks/5', { status: 'completed' });
  assert.equal(store.getSnapshot().busy, true);
  assert.equal(store.getSnapshot().plan.tasks[0].status, 'pending');
  assert.equal(await store.mutate('patch', '/1/tasks/5', {}), null);
  pending.reject({ status: 500 }); await request;
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().busy, false);
  assert.equal(store.getSnapshot().plan.tasks[0].status, 'pending');
  assert.equal(store.getSnapshot().error, 'supportPlans.requestError');
});

test('support conflict refreshes current plan without silently rebasing unsaved draft', async () => {
  let reads = 0;
  const store = createSupportPlanStore({ get: async () => ({ plan: plan({ status: 'draft', version: ++reads }) }),
    patch: async () => { throw { status: 409, data: { code: 'SUPPORT_PLAN_CONFLICT' } }; } }, '/base');
  await store.loadPlan(1);
  const unsaved = editableDraft(store.getSnapshot().plan);
  unsaved.title = 'Unsaved review';
  assert.equal(await store.mutate('patch', '/1', draftPayload(unsaved)), null);
  assert.equal(store.getSnapshot().plan.version, 2);
  assert.equal(store.getSnapshot().error, 'supportPlans.conflict');
  assert.equal(unsaved.version, 1);
  assert.equal(unsaved.title, 'Unsaved review');
  assert.equal(supportError({ status: 409, data: { code: 'SUPPORT_PLAN_INVALID_TRANSITION' } }), 'supportPlans.invalidAction');
});

test('support mutation invalidates an already pending detail read', async () => {
  const detail = deferred();
  const store = createSupportPlanStore({ get: url => url.includes('?') ? Promise.resolve(page()) : detail.promise,
    patch: async () => ({ plan: plan({ version: 3 }) }) }, '/base');
  const read = store.loadPlan(1);
  await store.mutate('patch', '/1/tasks/5', {});
  detail.resolve({ plan: plan() }); await read;
  assert.equal(store.getSnapshot().plan.version, 3);
});

test('support mutation cannot complete into a new selection or a disposed page after list refresh', async () => {
  for (const abandon of [store => store.dispose(), store => store.clearPlan(), store => { store.dispose(); store.resume(); }]) {
    const refresh = deferred();
    const store = createSupportPlanStore({ get: () => refresh.promise, post: async () => ({ plan: plan() }) }, '/base');
    const pending = store.mutate('post', '', draftPayload(draft()));
    await tick();
    abandon(store);
    refresh.resolve(page());
    assert.equal(await pending, null);
  }
});

test('support conflict from an abandoned plan cannot overwrite a newer selection error state', async () => {
  const refresh = deferred(); let reads = 0;
  const store = createSupportPlanStore({ get: async () => { reads++; return reads === 2 ? refresh.promise : { plan: plan({ id: reads === 3 ? 2 : 1 }) }; },
    patch: async () => { throw { status: 409 }; } }, '/base');
  await store.loadPlan(1);
  const update = store.mutate('patch', '/1', {}); await tick();
  await store.loadPlan(2);
  refresh.resolve({ plan: plan({ version: 4 }) }); await update;
  assert.equal(store.getSnapshot().plan.id, 2);
  assert.equal(store.getSnapshot().error, '');
});

test('support keeps committed data and optional warnings when list refresh fails', async () => {
  const store = createSupportPlanStore({ post: async () => ({ plan: plan(), warnings: ['SUPPORT_PLAN_NOTIFICATION_FAILED'] }),
    get: async () => { throw new Error('database unavailable'); } }, '/base');
  const result = await store.mutate('post', '/1/activate', { version: 1 });
  assert.ok(result);
  assert.equal(store.getSnapshot().plan.status, 'active');
  assert.equal(store.getSnapshot().warnings.length, 1);
  assert.equal(store.getSnapshot().error, 'supportPlans.requestError');
});

test('support page integration retains prefill across Strict Mode and requires explicit conflict reload', () => {
  const source = readFileSync(new URL('../pages/SupportPlans.jsx', import.meta.url), 'utf8');
  assert.match(source, /useState\(\(\) =>/);
  assert.match(source, /supportPlanStudentId/);
  assert.match(source, /key=\{`\$\{user\?\.id\}/);
  assert.match(source, /setEditor\(editableDraft\(state\.plan\)\)/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|window\.history\.replaceState/);
  const routes = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(routes, /path="\/admin\/support-plans"/);
  assert.match(routes, /path="\/student\/support-plans"/);
  assert.doesNotMatch(routes, /path="\/teacher\/support-plans"/);
});
