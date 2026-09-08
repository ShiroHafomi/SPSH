import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createJournalStore, DEFAULT_FILTERS, errorKey, isDirty, listState, newDraft, payload, toDraft, validateDraft, validDate, validFilters } from './learningJournal.js';
import en from '../locales/en.js';
import vi from '../locales/vi.js';
import { ROLE_NAVIGATION } from '../components/appShell.js';
const entry = { id: 1, version: 1, title: 'Algebra', entry_date: '2026-09-08', learned_text: 'Solving equations', difficulties_text: 'Fractions', next_steps_text: 'Practice', understanding_rating: null };
const clone = value => structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(initial = [entry]) {
  let rows = clone(initial); const calls = [];
  const api = {
    get: async (url, options) => {
      calls.push({ method: 'get', url, options });
      if (/\/\d+$/.test(url)) {
        const row = rows.find(row => row.id === Number(url.split('/').at(-1)));
        if (!row) throw { status: 404 };
        return { entry: clone(row), timeZone: 'UTC' };
      }
      return { entries: rows.map(row => ({ id: row.id, version: row.version, title: row.title, entry_date: row.entry_date, understanding_rating: row.understanding_rating, learned_preview: row.learned_text.slice(0, 200) })), pagination: { page: 1, size: 20, total: rows.length, totalPages: rows.length ? 1 : 0 }, today: '2026-09-08', timeZone: 'UTC' };
    },
    post: async (url, data, options) => { calls.push({ method: 'post', url, data, options }); const row = { ...clone(data), id: rows.length + 1, version: 1 }; rows.push(row); return { id: row.id, version: 1 }; },
    patch: async (url, data, options) => { calls.push({ method: 'patch', url, data, options }); const row = rows.find(row => row.id === Number(url.split('/').at(-1))); if (row.version !== data.version) throw { status: 409 }; Object.assign(row, data, { version: row.version + 1 }); return { id: row.id, version: row.version }; },
    delete: async (url, options) => { calls.push({ method: 'delete', url, options }); rows = []; return { ok: true }; },
  };
  return { api, calls, rows: () => rows, store: createJournalStore(api) };
}
function fill(store) { for (const [key, value] of Object.entries(toDraft(entry))) store.change(key, value); }

test('journal draft validation handles required text, bounds, real UTC dates and optional ratings', () => {
  const draft = toDraft(entry); assert.deepEqual(validateDraft(draft, '2026-09-08'), {});
  assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('0999-01-01'), false);
  assert.ok(validateDraft({ ...draft, entry_date: '2026-09-09' }, '2026-09-08').entry_date);
  for (const [key, max] of [['title', 150], ['learned_text', 3000], ['difficulties_text', 2000], ['next_steps_text', 2000]]) {
    assert.equal(validateDraft({ ...draft, [key]: 'x'.repeat(max) }, '2026-09-08')[key], undefined);
    assert.ok(validateDraft({ ...draft, [key]: 'x'.repeat(max + 1) }, '2026-09-08')[key]);
  }
  assert.ok(validateDraft({ ...draft, learned_text: '  ' }, '2026-09-08').learned_text);
  assert.ok(validateDraft({ ...draft, understanding_rating: '6' }, '2026-09-08').understanding_rating);
  assert.equal(payload(draft, null).understanding_rating, null); assert.equal('version' in payload(draft, null), false);
  assert.equal(payload({ ...draft, title: ' A ' }, 2).title, 'A'); assert.equal(payload(draft, 2).version, 2);
  assert.equal(newDraft('2026-09-08').entry_date, '2026-09-08');
});
test('filters permit omitted endpoints but reject malformed, reversed, excessive and unbounded input', () => {
  assert.equal(validFilters(DEFAULT_FILTERS), true);
  assert.equal(validFilters({ ...DEFAULT_FILTERS, from: '2020-01-01' }), true);
  for (const filters of [{ q: 'x'.repeat(101) }, { from: 'invalid' }, { rating: '6' }, { from: '2026-09-08', to: '2026-09-07' }, { from: '2024-01-01', to: '2025-01-01' }]) assert.equal(validFilters({ ...DEFAULT_FILTERS, ...filters }), false);
});
test('list exposes loading, empty, error and retry states and validates server data', async () => {
  const f = fixture([]), gate = deferred(), get = f.api.get;
  f.api.get = () => gate.promise;
  const pending = f.store.load(); assert.equal(listState(f.store.getSnapshot()), 'loading');
  gate.reject(new Error('offline')); await pending; assert.equal(listState(f.store.getSnapshot()), 'error');
  f.api.get = get; await f.store.load(); assert.equal(listState(f.store.getSnapshot()), 'empty');
  f.api.get = async () => ({ entries: [], pagination: { total: Infinity } }); await f.store.load(); assert.equal(listState(f.store.getSnapshot()), 'error');
});
test('create, open and edit use authoritative full details, correct payloads and versions', async () => {
  const f = fixture([]); await f.store.load(); f.store.create(); fill(f.store);
  assert.equal(isDirty(f.store.getSnapshot()), true); assert.equal(await f.store.save(), true);
  assert.equal(f.store.getSnapshot().mode, 'view'); assert.equal(f.store.getSnapshot().entry.id, 1);
  assert.equal(isDirty(f.store.getSnapshot()), false); assert.equal(f.calls.find(call => call.method === 'post').data.student_id, undefined);
  f.store.edit(); f.store.change('learned_text', 'A new reflection'); await f.store.save();
  assert.equal(f.store.getSnapshot().entry.learned_text, 'A new reflection');
  assert.equal(f.calls.find(call => call.method === 'patch').data.version, 1);
  assert.ok(f.calls.find(call => call.method === 'patch').options.signal);
});
test('invalid drafts never send writes and failed saves preserve exact content', async () => {
  const f = fixture([]); await f.store.load(); f.store.create(); assert.equal(await f.store.save(), false);
  assert.ok(f.store.getSnapshot().errors.title); assert.equal(f.calls.some(call => call.method === 'post'), false);
  fill(f.store); f.store.change('learned_text', '  My unsaved words\n'); const before = clone(f.store.getSnapshot().draft);
  f.api.post = async () => { throw new Error('private error'); }; await f.store.save();
  assert.deepEqual(f.store.getSnapshot().draft, before); assert.equal(f.store.getSnapshot().formError, 'learningJournal.saveFailed');
  assert.equal(f.store.getSnapshot().busy, false);
});
test('duplicate submissions and closing a pending mutation are prevented', async () => {
  const f = fixture([]); await f.store.load(); f.store.create(); fill(f.store);
  const gate = deferred(); let calls = 0; f.api.post = () => { calls++; return gate.promise; };
  const pending = f.store.save(); await f.store.save(); f.store.close(); f.store.change('title', 'Lost');
  assert.equal(calls, 1); assert.equal(f.store.getSnapshot().mode, 'create'); assert.equal(f.store.getSnapshot().draft.title, 'Algebra');
  gate.reject(new Error('offline')); await pending;
});
test('stale edits remain unchanged and require explicit discard/reload, not silent rebasing', async () => {
  const f = fixture(); await f.store.open(1); f.store.edit(); f.store.change('title', 'Unsaved'); f.rows()[0].version = 2;
  await f.store.save(); assert.equal(f.store.getSnapshot().conflicted, true); assert.equal(f.store.getSnapshot().version, 1);
  assert.equal(f.store.getSnapshot().draft.title, 'Unsaved'); const count = f.calls.length; await f.store.save(); assert.equal(f.calls.length, count);
  f.store.reload(); assert.equal(f.store.getSnapshot().discardAction, 'reload'); f.store.keepEditing(); assert.equal(f.store.getSnapshot().draft.title, 'Unsaved');
  f.store.reload(); await f.store.discardEdits(); assert.equal(f.store.getSnapshot().mode, 'view'); assert.equal(f.store.getSnapshot().entry.version, 2);
});
test('unsaved close requires confirmation and keep-editing preserves content', async () => {
  const f = fixture(); await f.store.load(); f.store.create(); fill(f.store); f.store.close();
  assert.equal(f.store.getSnapshot().discardAction, 'close'); f.store.keepEditing(); assert.equal(isDirty(f.store.getSnapshot()), true);
  f.store.close(); f.store.discardEdits(); assert.equal(f.store.getSnapshot().mode, null); assert.equal(f.store.getSnapshot().draft, null);
});
test('delete requires detail and explicit confirmation, handles failures and stale deletion safely', async () => {
  const f = fixture(); assert.equal(await f.store.remove(), false); await f.store.open(1); assert.equal(await f.store.remove(), false);
  f.store.confirmDelete(); assert.equal(f.store.getSnapshot().mode, 'delete'); f.store.cancelDelete(); assert.equal(f.calls.some(call => call.method === 'delete'), false);
  const remove = f.api.delete; f.api.delete = async () => { throw { status: 409 }; }; f.store.confirmDelete(); await f.store.remove();
  assert.equal(f.store.getSnapshot().conflicted, true); assert.equal(f.store.getSnapshot().mode, 'delete');
  await f.store.reload(); assert.equal(f.store.getSnapshot().mode, 'view');
  f.api.delete = remove; f.store.confirmDelete(); await f.store.remove(); assert.equal(f.store.getSnapshot().mode, null);
  assert.equal(f.store.getSnapshot().notice, 'learningJournal.deleted'); assert.equal(f.calls.at(-2).url.endsWith('/1?version=1'), true);
});
test('a failed detail fetch after a successful save is not reported as a failed write', async () => {
  const f = fixture([]); await f.store.load(); f.store.create(); fill(f.store);
  const get = f.api.get; f.api.get = (url, options) => /\/\d+$/.test(url) ? Promise.reject(new Error('offline')) : get(url, options);
  assert.equal(await f.store.save(), true); assert.equal(f.store.getSnapshot().notice, 'learningJournal.saved');
  assert.equal(f.store.getSnapshot().draft, null); assert.equal(f.store.getSnapshot().formError, 'learningJournal.requestFailed');
});
test('superseded detail reads and disposed mutations cannot repopulate closed/account-switched state', async () => {
  const f = fixture(), gate = deferred(); const get = f.api.get; let signal;
  f.api.get = (url, options) => { signal = options.signal; return gate.promise; };
  const pending = f.store.open(1); f.store.close(); assert.equal(signal.aborted, true); gate.resolve({ entry }); await pending; assert.equal(f.store.getSnapshot().entry, null);
  f.api.get = get; await f.store.load(); f.store.create(); fill(f.store); const write = deferred();
  f.api.post = (url, data, options) => { signal = options.signal; return write.promise; }; const saving = f.store.save();
  f.store.dispose(); assert.equal(signal.aborted, true); write.resolve({ id: 2, version: 1 }); await saving; assert.equal(f.store.getSnapshot().notice, '');
});
test('list refresh does not replace an unsaved draft and stale lists are canceled', async () => {
  const f = fixture(); await f.store.open(1); f.store.edit(); f.store.change('title', 'Keep me'); await f.store.load(); assert.equal(f.store.getSnapshot().draft.title, 'Keep me');
  const gate = deferred(), get = f.api.get; let signal; f.api.get = (url, options) => { signal = options.signal; return gate.promise; };
  const pending = f.store.load(); f.api.get = get; await f.store.load(); assert.equal(signal.aborted, true);
  gate.reject(new Error('old request')); await pending; assert.equal(f.store.getSnapshot().error, '');
});
test('safe messages and EN/VI keys/interpolations stay aligned; only student navigation exposes journal', () => {
  assert.equal(errorKey({ status: 404 }), 'learningJournal.notFound'); assert.equal(errorKey({ status: 403 }), 'learningJournal.access');
  assert.deepEqual(Object.keys(en.learningJournal).sort(), Object.keys(vi.learningJournal).sort());
  for (const key of Object.keys(en.learningJournal)) assert.deepEqual(en.learningJournal[key].match(/\{\w+\}/g), vi.learningJournal[key].match(/\{\w+\}/g));
  const source = fs.readFileSync(new URL('../pages/LearningJournal.jsx', import.meta.url), 'utf8');
  for (const [, key] of source.matchAll(/t\('learningJournal\.([^']+)'/g)) assert.ok(en.learningJournal[key], key);
  assert.match(source, /beforeunload/); assert.match(source, /discardEdits/); assert.match(source, /aria-invalid/); assert.match(source, /<Modal/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|localStorage|sessionStorage/);
  for (const role of ['admin', 'teacher', 'student']) assert.equal(ROLE_NAVIGATION[role].flatMap(group => group.items).some(item => item.to === '/student/learning-journal'), role === 'student');
});
