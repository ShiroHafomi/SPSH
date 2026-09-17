'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const service = require('./learningJournalService');
const { entryInput, listInput, deleteInput, JournalError } = require('../utils/learningJournalValidation');
const actor = { id: 20, role: 'student', studentId: 7 };
const input = { title: '  Algebra reflection  ', entry_date: '2026-09-08', learned_text: ' Solving equations ', difficulties_text: '', next_steps_text: 'Practice', understanding_rating: null };
const today = '2026-09-08';
function database(t) {
  let rows = [], sequence = 0, snapshot, failure;
  const calls = [], events = [];
  async function query(sql, args = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim(); calls.push({ sql: normalized, args });
    if (failure) throw failure;
    if (normalized.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
    if (normalized.includes('UTC_DATE()')) return [[{ today }]];
    if (normalized.startsWith('SELECT id FROM `')) return [[{ id: 7 }]];
    if (normalized.startsWith('INSERT')) {
      const [student_id, owner_user_id, title, entry_date, learned_text, difficulties_text, next_steps_text, understanding_rating] = args;
      const row = { id: ++sequence, student_id, owner_user_id, title, entry_date, learned_text, difficulties_text, next_steps_text, understanding_rating, version: 1 };
      rows.push(row); return [{ insertId: row.id }];
    }
    if (normalized.startsWith('UPDATE')) {
      const [title, entry_date, learned_text, difficulties_text, next_steps_text, understanding_rating, studentId, userId, id, version] = args;
      const row = rows.find(row => row.id === id && row.student_id === studentId && row.owner_user_id === userId && row.version === version);
      if (row) Object.assign(row, { title, entry_date, learned_text, difficulties_text, next_steps_text, understanding_rating, version: version + 1 });
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (normalized.startsWith('DELETE')) {
      const [studentId, userId, id, version] = args;
      const before = rows.length; rows = rows.filter(row => !(row.id === id && row.student_id === studentId && row.owner_user_id === userId && row.version === version));
      return [{ affectedRows: before - rows.length }];
    }
    const selected = rows.filter(row => row.student_id === args[0] && row.owner_user_id === args[1]);
    if (normalized.includes('COUNT(*)')) return [[{ total: selected.length }]];
    if (normalized.includes('LEFT(learned_text')) return [selected.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id).slice(args.at(-1), args.at(-1) + args.at(-2)).map(row => ({ id: row.id, title: row.title, entry_date: row.entry_date, understanding_rating: row.understanding_rating, version: row.version, learned_preview: row.learned_text.slice(0, 200) }))];
    if (normalized.startsWith('SELECT')) return [structuredClone(selected.filter(row => row.id === args[2]))];
    throw new Error('Unexpected query');
  }
  const db = { query, beginTransaction: async () => { events.push('begin'); snapshot = structuredClone(rows); }, commit: async () => { events.push('commit'); }, rollback: async () => { events.push('rollback'); rows = snapshot; }, release: () => events.push('release') };
  t.mock.method(pool, 'query', query); t.mock.method(pool, 'getConnection', async () => db);
  return { calls, events, fail: error => { failure = error; }, rows: () => rows };
}
const rejects = (fn, status) => assert.rejects(fn, error => error instanceof JournalError && error.status === status);

test('journal schema is idempotent, indexed and cannot cascade deletes upward', async t => {
  const db = database(t); await service.ensureLearningJournalTable(); await service.ensureLearningJournalTable();
  assert.equal(db.calls.length, 2);
  const sql = db.calls[0].sql;
  assert.match(sql, /CREATE TABLE IF NOT EXISTS student_learning_journal/);
  assert.match(sql, /INDEX idx_journal_student_date \(student_id, owner_user_id, entry_date, id\)/);
  assert.match(sql, /REFERENCES `students` \(id\) ON DELETE CASCADE/);
  assert.match(sql, /REFERENCES users \(id\) ON DELETE CASCADE/);
  assert.match(sql, /CHECK \(understanding_rating IS NULL OR understanding_rating BETWEEN 1 AND 5\)/);
  assert.doesNotMatch(sql, /UNIQUE.*entry_date/);
});
test('create, private detail, versioned update and permanent delete work without side effects', async t => {
  const db = database(t); const created = await service.create(actor, input);
  assert.deepEqual(created, { id: 1, version: 1 });
  assert.equal((await service.get(actor, 1)).entry.title, 'Algebra reflection');
  assert.equal((await service.get(actor, 1)).entry.understanding_rating, null);
  assert.deepEqual(await service.update(actor, 1, { ...input, learned_text: 'New learning', understanding_rating: 5, version: 1 }), { id: 1, version: 2 });
  assert.equal((await service.get(actor, 1)).entry.learned_text, 'New learning');
  assert.deepEqual(await service.remove(actor, 1, { version: 2 }), { ok: true });
  await rejects(() => service.get(actor, 1), 404);
  assert.equal(db.calls.filter(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql)).every(call => call.sql.includes('student_learning_journal')), true);
  assert.equal(db.events.filter(value => value === 'release').length, 3);
});
test('multiple entries on the same day are allowed and previews never return full reflection fields', async t => {
  database(t); await service.create(actor, { ...input, learned_text: 'a'.repeat(3000) }); await service.create(actor, input);
  const result = await service.list(actor, {});
  assert.deepEqual(result.entries.map(row => row.id), [2, 1]);
  assert.equal(result.entries[1].learned_preview.length, 200);
  for (const row of result.entries) for (const field of ['learned_text', 'difficulties_text', 'next_steps_text']) assert.equal(field in row, false);
  assert.equal(result.timeZone, 'UTC'); assert.equal(result.today, today); assert.equal(result.pagination.size, 20);
});
test('all operations deny missing authentication, staff, and missing student linkage', async t => {
  const db = database(t);
  for (const forbidden of [null, { ...actor, role: 'admin' }, { ...actor, role: 'teacher' }, { ...actor, studentId: null }]) {
    const status = forbidden ? 403 : 401;
    for (const run of [() => service.list(forbidden, {}), () => service.get(forbidden, 1), () => service.create(forbidden, input), () => service.update(forbidden, 1, { ...input, version: 1 }), () => service.remove(forbidden, 1, { version: 1 })]) await rejects(run, status);
  }
  assert.equal(db.calls.length, 0);
});
test('another student and another account sharing the same student cannot read, search, edit or delete entries', async t => {
  const db = database(t); await service.create(actor, input);
  for (const other of [{ ...actor, id: 30, studentId: 8 }, { ...actor, id: 30 }, { ...actor, studentId: 8 }]) {
    assert.deepEqual((await service.list(other, { q: 'Algebra' })).entries, []);
    await rejects(() => service.get(other, 1), 404);
    await rejects(() => service.update(other, 1, { ...input, version: 1 }), 404);
    await rejects(() => service.remove(other, 1, { version: 1 }), 404);
  }
  assert.equal(db.rows().length, 1); assert.equal(db.rows()[0].version, 1);
  for (const call of db.calls.filter(call => /FROM student_learning_journal/.test(call.sql))) assert.match(call.sql, /student_id = \? AND owner_user_id = \?/);
});
test('stale update/delete cannot overwrite or remove an entry and require renewed versions', async t => {
  database(t); await service.create(actor, input); await service.update(actor, 1, { ...input, version: 1 });
  await rejects(() => service.update(actor, 1, { ...input, title: 'Lost update', version: 1 }), 409);
  await rejects(() => service.remove(actor, 1, { version: 1 }), 409);
  assert.equal((await service.get(actor, 1)).entry.version, 2);
});
test('calendar validation supports leap days/past dates but rejects invalid or future UTC dates', () => {
  for (const date of ['1000-01-01', '2024-02-29', today]) assert.equal(entryInput({ ...input, entry_date: date }, today).entry_date, date);
  for (const date of ['2026-09-09', '2025-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '0999-01-01', '2026-09-08T00:00:00Z', null]) assert.throws(() => entryInput({ ...input, entry_date: date }, today), { status: 400 });
});
test('text validation enforces trimmed bounds, optional fields and rejects unknown writable fields', () => {
  for (const [field, limit] of [['title', 150], ['learned_text', 3000], ['difficulties_text', 2000], ['next_steps_text', 2000]]) {
    assert.equal(entryInput({ ...input, [field]: 'x'.repeat(limit) }, today)[field].length, limit);
    assert.throws(() => entryInput({ ...input, [field]: 'x'.repeat(limit + 1) }, today), { status: 400 });
    assert.throws(() => entryInput({ ...input, [field]: {} }, today), { status: 400 });
  }
  for (const field of ['title', 'learned_text']) assert.throws(() => entryInput({ ...input, [field]: ' \n ' }, today), { status: 400 });
  for (const field of ['student_id', 'owner_user_id', 'created_at', 'id', 'version']) assert.throws(() => entryInput({ ...input, [field]: 1 }, today), { status: 400 });
  assert.equal(entryInput({ title: 'Test', entry_date: today, learned_text: 'Line 1\nLine 2' }, today).difficulties_text, '');
  assert.throws(() => entryInput({ ...input, title: 'Bad\nTitle' }, today), { status: 400 });
});
test('ratings are integers one to five or null and versions reject unsafe/coerced values', () => {
  for (const rating of [null, 1, 2, 3, 4, 5]) assert.equal(entryInput({ ...input, understanding_rating: rating }, today).understanding_rating, rating);
  for (const rating of [0, 6, 1.5, '3', true, NaN, Infinity, {}]) assert.throws(() => entryInput({ ...input, understanding_rating: rating }, today), { status: 400 });
  for (const version of [0, -1, true, '1.0', '01', Number.MAX_SAFE_INTEGER + 1, 4294967296]) assert.throws(() => deleteInput({ version }), { status: 400 });
  assert.throws(() => deleteInput({ version: 1, student_id: 7 }), { status: 400 });
});
test('list filters and pagination are bounded, optional dates work, and reversed/wide windows fail', () => {
  assert.equal(listInput().size, 20); assert.equal(listInput({ size: '100' }).size, 100);
  assert.equal(listInput({ from: '2020-01-01' }).to, null); assert.equal(listInput({ to: today }).from, null);
  assert.equal(listInput({ from: '2024-01-01', to: '2024-12-31' }).from, '2024-01-01');
  for (const filter of [{ page: 0 }, { size: 101 }, { page: 5002 }, { q: 'x'.repeat(101) }, { q: {} }, { rating: 6 }, { rating: '1 OR 1' }, { from: '2026-01-02', to: '2026-01-01' }, { from: '2024-01-01', to: '2025-01-01' }, { from: '' }, { unknown: 'field' }]) assert.throws(() => listInput(filter), { status: 400 });
});
test('search/date/rating predicates and pagination bind parameters without exposing complete text', async t => {
  const db = database(t);
  const q = "%' OR 1=1 --_!";
  await service.list(actor, { q, from: '2026-01-01', to: today, rating: '4', size: '100' });
  const call = db.calls.find(call => call.sql.includes('LEFT(learned_text'));
  assert.doesNotMatch(call.sql, /1=1/); assert.match(call.sql, /ORDER BY entry_date DESC, id DESC LIMIT \? OFFSET \?/);
  assert.match(call.sql, /entry_date >= \? AND entry_date <= \? AND understanding_rating = \?/);
  assert.deepEqual(call.args.slice(0, 2), [7, 20]);
  assert.equal(call.args[2], "%!%' OR 1=1 --!_!!%");
  assert.deepEqual(call.args.slice(-5), ['2026-01-01', today, 4, 100, 0]);
});
test('transaction errors always roll back and release; deadlocks become safe conflicts', async t => {
  const db = database(t); db.fail(Object.assign(new Error('private SQL value'), { code: 'ER_LOCK_DEADLOCK' }));
  await rejects(() => service.create(actor, input), 409);
  assert.deepEqual(db.events, ['begin', 'rollback', 'release']);
});
