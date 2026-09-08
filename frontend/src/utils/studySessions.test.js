import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIMER_BASE, MAX_SECONDS, instant, defaultWindow, validWindow, startPayload, normalizeSession, elapsedSeconds, formatDuration, actionsFor, createStudySessionStore } from './studySessions.js';
import en from '../locales/en.js';
import vi from '../locales/vi.js';
import { getNavigationForRole } from '../components/appShell.js';

const stamp = '2026-09-08T10:00:00.000Z';
const session = (values = {}) => ({ id: 1, title: 'Review algebra', assignment_id: null, status: 'running', version: 1,
  started_at: stamp, running_since: stamp, ended_at: null, accumulated_seconds: 0, elapsedSeconds: 0, limitReached: false, clockAdjusted: false, ...values });
const envelope = value => ({ session: value, serverNow: stamp, maxSeconds: MAX_SECONDS });
const summary = () => ({ timeZone: 'UTC', grouping: 'completion_date', completedSessionCount: 0, totalCompletedSeconds: 0, averageCompletedSeconds: 0, daily: [{ date: '2026-09-08', completedSessionCount: 0, totalCompletedSeconds: 0 }] });
const history = () => ({ sessions: [], pagination: { page: 1, size: 20, total: 0, totalPages: 0 } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(current = null) {
  const calls = [];
  const api = {
    get: async (path, options) => {
      calls.push({ method: 'get', path, options });
      if (path.endsWith('/current')) return envelope(current);
      if (path.startsWith(`${TIMER_BASE}/summary`)) return summary();
      if (path.startsWith('/student/me/assignments')) return { assignments: [{ id: 12, title: 'Practice' }], pagination: { page: 1, size: 20, total: 1, totalPages: 1 } };
      return history();
    },
    post: async (path, body, options) => {
      calls.push({ method: 'post', path, body, options });
      if (path === TIMER_BASE) current = session({ title: body.title, assignment_id: body.assignment_id });
      else {
        const status = { pause: 'paused', resume: 'running', finish: 'completed', discard: 'discarded' }[path.split('/').at(-1)];
        current = session({ ...current, status, version: current.version + 1, running_since: status === 'running' ? stamp : null, ended_at: ['completed', 'discarded'].includes(status) ? stamp : null });
      }
      const result = envelope(current);
      if (['completed', 'discarded'].includes(current.status)) current = null;
      return result;
    },
  };
  return { api, calls, setCurrent: value => { current = value; } };
}

test('display uses only monotonic time after the server snapshot, excludes pauses, and caps invalid values', () => {
  const running = session({ elapsedSeconds: 90.125 });
  assert.equal(formatDuration(elapsedSeconds(running, 1000, 30875)), '00:02:00');
  assert.equal(elapsedSeconds({ ...running, status: 'paused' }, 1000, 100000), 90.125);
  assert.equal(elapsedSeconds(running, 500, 0), 90.125);
  assert.equal(elapsedSeconds(running, 0, 1e12), MAX_SECONDS);
  assert.equal(formatDuration(MAX_SECONDS), '08:00:00');
  assert.equal(formatDuration(90000), '25:00:00');
  for (const value of [NaN, Infinity, undefined, -1]) assert.equal(formatDuration(value), '00:00:00');
  assert.equal(elapsedSeconds(null, 0, 1), 0);
});
test('title, assignment, UTC instant, and inclusive date-window validation fail closed', () => {
  assert.deepEqual(startPayload('  Practice  ', '12'), { title: 'Practice', assignment_id: 12 });
  assert.deepEqual(startPayload('Practice'), { title: 'Practice', assignment_id: null });
  for (const title of ['', '   ', 'a'.repeat(151), 'a\nb', null]) assert.equal(startPayload(title), null);
  for (const id of ['01', '-2', true, '1e3', '9007199254740992']) assert.equal(startPayload('Study', id), null);
  assert.deepEqual(defaultWindow(new Date(stamp)), { from: '2026-09-02', to: '2026-09-08', status: 'all' });
  assert.ok(validWindow({ from: '2026-06-01', to: '2026-09-01' }));
  for (const window of [{ from: '2026-06-01', to: '2026-09-02' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-09-09', to: '2026-09-08' }, { from: '', to: '' }]) assert.equal(validWindow(window), false);
  for (const date of ['2026-02-30T00:00:00Z', '2026-09-08', 'bad', '2026-09-08T24:00:00Z']) assert.equal(instant(date), null);
});
test('only valid server sessions and lifecycle controls can be rendered', () => {
  assert.deepEqual(actionsFor(session()), ['pause', 'finish', 'discard']);
  assert.deepEqual(actionsFor(session({ status: 'paused' })), ['resume', 'finish', 'discard']);
  assert.deepEqual(actionsFor(session({ status: 'paused', limitReached: true })), ['finish', 'discard']);
  assert.deepEqual(actionsFor(session({ status: 'completed' })), []);
  for (const values of [{ id: -1 }, { version: 0 }, { title: '' }, { status: 'planned' }, { elapsedSeconds: Infinity }, { elapsedSeconds: 28801 }, { accumulated_seconds: -1 }, { started_at: 'bad' }, { running_since: null }, { assignment_id: -1 }]) assert.throws(() => normalizeSession(session(values)));
});
test('initial loading disables mutations and refresh restores an unfinished session', async () => {
  const f = fixture(), pending = deferred(), original = f.api.get;
  f.api.get = (path, options) => path.endsWith('/current') ? pending.promise : original(path, options);
  const store = createStudySessionStore(f.api, { now: () => 100 });
  const refresh = store.refresh();
  assert.equal(store.getSnapshot().currentLoading, true);
  assert.equal(await store.mutate('start', { title: 'Study' }), null);
  pending.resolve(envelope(session({ elapsedSeconds: 75 })));
  await refresh;
  assert.equal(store.getSnapshot().receivedAt, 100);
  assert.equal(store.getSnapshot().session.elapsedSeconds, 75);
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().currentLoading, false);
});
test('complete workflow sends title/assignment or version only and refreshes authoritative state', async () => {
  const f = fixture(); let notifications = 0;
  const store = createStudySessionStore(f.api, { notify: () => notifications++ });
  await store.refresh();
  await store.mutate('start', { title: '  Practice ', assignment_id: 12 });
  assert.equal(store.getSnapshot().session.title, 'Practice');
  await store.mutate('pause'); assert.equal(store.getSnapshot().session.status, 'paused');
  await store.mutate('resume'); assert.equal(store.getSnapshot().session.status, 'running');
  await store.mutate('finish'); assert.equal(store.getSnapshot().session, null);
  assert.equal(store.getSnapshot().notice, 'studySessions.notices.finish');
  const posts = f.calls.filter(call => call.method === 'post');
  assert.deepEqual(posts.map(call => call.body), [{ title: 'Practice', assignment_id: 12 }, { version: 1 }, { version: 2 }, { version: 3 }]);
  assert.equal(notifications, 4);
  assert.ok(f.calls.every(call => call.options.signal instanceof AbortSignal));
});
test('duplicate clicks cannot start concurrent mutations and invalid actions never post', async () => {
  const f = fixture(), pending = deferred(); let posts = 0;
  f.api.post = () => { posts++; return pending.promise; };
  const store = createStudySessionStore(f.api); await store.refresh();
  await store.mutate('pause'); await store.mutate('start', { title: '' }); assert.equal(posts, 0);
  const first = store.mutate('start', { title: 'Practice' });
  assert.equal(store.getSnapshot().busy, true);
  assert.equal(await store.mutate('start', { title: 'Practice' }), null);
  f.setCurrent(session()); pending.resolve(envelope(session())); await first;
  assert.equal(posts, 1); assert.equal(store.getSnapshot().busy, false);
});
test('stale-version and uncertain-network failures reconcile without optimistic duration or retrying a write', async () => {
  for (const error of [{ status: 409 }, new Error('Connection lost')]) {
    const f = fixture(session()); let writes = 0;
    f.api.post = async () => { writes++; f.setCurrent(session({ status: 'paused', version: 2, elapsedSeconds: 42, accumulated_seconds: 42 })); throw error; };
    const store = createStudySessionStore(f.api); await store.refresh();
    assert.equal(await store.mutate('finish'), null);
    assert.equal(store.getSnapshot().session.version, 2);
    assert.equal(store.getSnapshot().session.elapsedSeconds, 42);
    assert.equal(store.getSnapshot().error, error.status === 409 ? 'studySessions.errors.conflict' : 'studySessions.errors.request');
    assert.equal(store.getSnapshot().busy, false); assert.equal(writes, 1);
  }
});
test('failed refresh fails closed, retains visible context, and allows an explicit retry', async () => {
  const f = fixture(session()), original = f.api.get;
  const store = createStudySessionStore(f.api); await store.refresh();
  f.api.get = async () => { throw new Error('private SQL'); };
  await store.refresh(); assert.equal(store.getSnapshot().ready, false);
  assert.equal(await store.mutate('pause'), null);
  assert.equal(store.getSnapshot().error, 'studySessions.errors.request');
  assert.equal(store.getSnapshot().reportError, 'studySessions.errors.request');
  f.api.get = original; await store.refresh(); assert.equal(store.getSnapshot().ready, true); assert.equal(store.getSnapshot().error, '');
});
test('external change notification does not announce ordinary elapsed-time refreshes', async () => {
  const f = fixture(session()), store = createStudySessionStore(f.api); await store.refresh();
  f.setCurrent(session({ elapsedSeconds: 10 })); await store.refresh(true); assert.equal(store.getSnapshot().notice, '');
  f.setCurrent(session({ status: 'paused', version: 2 })); await store.refresh(true); assert.equal(store.getSnapshot().notice, 'studySessions.changed');
});
test('external invalidation arriving during the post-action report is not lost', async () => {
  const f = fixture(session()), store = createStudySessionStore(f.api); await store.refresh();
  const pending = deferred(), original = f.api.get; let hold = true;
  f.api.get = (path, options) => path.startsWith(`${TIMER_BASE}/summary`) && hold ? pending.promise : original(path, options);
  const mutation = store.mutate('pause');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.getSnapshot().session.status, 'paused');
  f.setCurrent(session({ version: 3, status: 'running' })); await store.refresh(true);
  hold = false; pending.resolve(summary()); await mutation;
  assert.equal(store.getSnapshot().session.version, 3);
  assert.equal(store.getSnapshot().notice, 'studySessions.changed');
});
test('superseded current reads and disposed requests cannot replace the latest account state', async () => {
  const f = fixture(), original = f.api.get, first = deferred(); let reads = 0, signal;
  f.api.get = (path, options) => {
    if (path.endsWith('/current') && ++reads === 1) { signal = options.signal; return first.promise; }
    return original(path, options);
  };
  const store = createStudySessionStore(f.api), old = store.refresh();
  await store.refresh(); assert.equal(signal.aborted, true);
  first.resolve(envelope(session())); await old; assert.equal(store.getSnapshot().session, null);
  const pending = deferred(); f.api.post = async () => pending.promise;
  const write = store.mutate('start', { title: 'Study' }); store.dispose(); store.resume();
  await store.refresh(); pending.resolve(envelope(session())); assert.equal(await write, null);
  assert.equal(store.getSnapshot().session, null); assert.equal(store.getSnapshot().busy, false);
});
test('reports validate windows, reject malformed data, support retry, and keep summaries independent of status', async () => {
  const f = fixture(), store = createStudySessionStore(f.api);
  await store.loadReport({ from: '2026-09-09', to: '2026-09-08' }); assert.equal(f.calls.length, 0);
  assert.equal(store.getSnapshot().reportError, 'studySessions.errors.window');
  const filters = { from: '2026-09-08', to: '2026-09-08', status: 'discarded' };
  await store.loadReport(filters, 2);
  assert.ok(f.calls.some(call => call.path.includes('page=2&size=20&status=discarded')));
  assert.ok(f.calls.find(call => call.path.includes('/summary?')).path.endsWith('to=2026-09-08'));
  const original = f.api.get; f.api.get = async path => path.includes('/summary?') ? { ...summary(), totalCompletedSeconds: NaN } : history();
  await store.loadReport(); assert.equal(store.getSnapshot().summary, null); assert.ok(store.getSnapshot().reportError);
  f.api.get = original; await store.loadReport(); assert.equal(store.getSnapshot().reportError, '');
});
test('assignment search is bounded, cancellable, paginated, and failure does not block standalone sessions', async () => {
  const f = fixture(), store = createStudySessionStore(f.api); await store.refresh(); await store.loadAssignments(1, 'Practice');
  assert.equal(store.getSnapshot().assignments[0].id, 12);
  assert.ok(f.calls.some(call => call.path.includes('q=Practice&sort=due_asc')));
  const original = f.api.get; f.api.get = async () => { throw new Error('Failed'); }; await store.loadAssignments();
  assert.deepEqual(store.getSnapshot().assignments, []); assert.equal(store.getSnapshot().assignmentLoading, false);
  f.api.get = original; assert.ok(await store.mutate('start', { title: 'Independent study' }));
});
test('student-only route, accessible timer, lifecycle cleanup, and complete EN/VI key parity', () => {
  function flatten(value, prefix = '') { return Object.entries(value).flatMap(([key, value]) => typeof value === 'string' ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`)); }
  const left = Object.fromEntries(flatten(en.studySessions)), right = Object.fromEntries(flatten(vi.studySessions));
  assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort());
  for (const key of Object.keys(left)) assert.deepEqual(left[key].match(/\{\w+\}/g) || [], right[key].match(/\{\w+\}/g) || [], key);
  const page = readFileSync(new URL('../pages/StudySessions.jsx', import.meta.url), 'utf8');
  for (const match of page.matchAll(/t\('studySessions\.([^']+)'/g)) assert.ok(left[match[1]], match[1]);
  assert.match(page, /role="timer" aria-live="off"/);
  assert.match(page, /clearInterval/); assert.match(page, /store\.dispose\(\)/); assert.match(page, /BroadcastChannel/);
  assert.match(page, /<table/); assert.match(page, /<label/); assert.doesNotMatch(page, /localStorage|dangerouslySetInnerHTML/);
  assert.ok(getNavigationForRole('student').flatMap(group => group.items).some(item => item.to === '/student/study-sessions'));
  for (const role of ['admin', 'teacher']) assert.ok(getNavigationForRole(role).flatMap(group => group.items).every(item => item.to !== '/student/study-sessions'));
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const studentGroup = app.slice(app.indexOf('<ProtectedRoute roles={[\'student\']}>'), app.indexOf('{/* Shared routes'));
  assert.match(studentGroup, /path="\/student\/study-sessions" element={<StudySessions \/>}/);
});
