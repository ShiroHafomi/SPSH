'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const service = require('./studyTimerService');
const validation = require('../utils/studyTimerValidation');
const student = { id: 20, role: 'student', studentId: 7 };
const other = { id: 21, role: 'student', studentId: 8 };
const originals = { query: pool.query, getConnection: pool.getConnection };
let rows, sqlCalls, now, events, fail, mutex;
const iso = value => value == null ? null : `${value.replace(' ', 'T')}Z`;
const advance = seconds => { now = new Date(now.getTime() + seconds * 1000); };
const rejected = (promise, status, code) => assert.rejects(promise, error => error.status === status && (!code || error.code === code));
async function query(sql, args = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  sqlCalls.push({ sql: text, args });
  assert.doesNotMatch(text, /SELECT\s+\*/);
  if (fail?.(text)) throw new Error('private SQL password=secret');
  if (text.startsWith('CREATE TABLE')) return [{}];
  if (text.startsWith('SELECT DATE_FORMAT(UTC_TIMESTAMP')) return [[{ now: now.toISOString() }]];
  if (text.startsWith('SELECT id FROM student_assignments')) return [args[0] === 12 && args[1] === 20 && args[2] === 7 ? [{ id: 12 }] : []];
  if (text.startsWith('INSERT INTO study_session_timers')) {
    if (rows.some(row => row.student_id === args[0] && ['running', 'paused'].includes(row.status))) {
      const error = new Error('duplicate unfinished_student_id'); error.code = 'ER_DUP_ENTRY'; throw error;
    }
    const row = { id: rows.length + 1, student_id: args[0], owner_user_id: args[1], assignment_id: args[2], title: args[3],
      started_at: iso(args[4]), running_since: iso(args[5]), last_observed_at: iso(args[6]), ended_at: null,
      accumulated_seconds: 0, version: 1, status: 'running', clock_adjusted: 0 };
    rows.push(row); return [{ insertId: row.id, affectedRows: 1 }];
  }
  if (text.startsWith('UPDATE study_session_timers SET started_at')) {
    const row = rows.find(row => row.id === args[3] && row.student_id === args[4] && row.owner_user_id === args[5]);
    Object.assign(row, { started_at: iso(args[0]), running_since: iso(args[1]), last_observed_at: iso(args[2]) });
    return [{ affectedRows: 1 }];
  }
  if (text.startsWith('UPDATE study_session_timers SET status')) {
    const row = rows.find(row => row.id === args[6] && row.student_id === args[7] && row.owner_user_id === args[8] && row.version === args[9]);
    if (!row) return [{ affectedRows: 0 }];
    Object.assign(row, { status: args[0], accumulated_seconds: args[1], running_since: iso(args[2]), ended_at: iso(args[3]),
      last_observed_at: iso(args[4]), clock_adjusted: args[5], version: row.version + 1 });
    return [{ affectedRows: 1 }];
  }
  if (text.startsWith('UPDATE study_session_timers SET last_observed_at')) {
    const row = rows.find(row => row.id === args[1] && row.student_id === args[2] && row.owner_user_id === args[3] && row.version === args[4]);
    if (row) row.last_observed_at = iso(args[0]); return [{ affectedRows: Number(Boolean(row)) }];
  }
  if (text.includes('LIMIT 1 FOR UPDATE')) {
    return [structuredClone(rows.filter(row => row.student_id === args[0] && row.owner_user_id === args[1] &&
      (args.length === 3 ? row.id === args[2] : ['running', 'paused'].includes(row.status))).slice(0, 1))];
  }
  if (text.includes('WITH ROLLUP')) {
    const selected = rows.filter(row => row.student_id === args[0] && row.owner_user_id === args[1] && row.status === 'completed' && row.ended_at >= iso(args[2]) && row.ended_at < iso(args[3]));
    const aggregate = (group, date) => ({ date, completedSessionCount: group.length,
      totalCompletedSeconds: group.reduce((sum, row) => sum + row.accumulated_seconds, 0),
      averageCompletedSeconds: group.length ? group.reduce((sum, row) => sum + row.accumulated_seconds, 0) / group.length : 0 });
    const days = [...new Set(selected.map(row => row.ended_at.slice(0, 10)))];
    return [[...days.map(day => aggregate(selected.filter(row => row.ended_at.startsWith(day)), day)), aggregate(selected, null)]];
  }
  if (text.startsWith('SELECT COUNT(*) AS total') || text.includes('ORDER BY ended_at DESC')) {
    const status = text.includes('status = ?') ? args[2] : null;
    const index = status ? 3 : 2;
    const selected = rows.filter(row => row.student_id === args[0] && row.owner_user_id === args[1] &&
      (status ? row.status === status : ['completed', 'discarded'].includes(row.status)) && row.ended_at >= iso(args[index]) && row.ended_at < iso(args[index + 1]))
      .sort((a, b) => b.ended_at.localeCompare(a.ended_at) || b.id - a.id);
    if (text.startsWith('SELECT COUNT')) return [[{ total: selected.length }]];
    return [structuredClone(selected.slice(args.at(-1), args.at(-1) + args.at(-2)))];
  }
  throw new Error(`Unhandled SQL: ${text}`);
}
beforeEach(() => {
  rows = []; sqlCalls = []; events = []; fail = null; mutex = Promise.resolve(); now = new Date('2026-09-08T10:00:00Z');
  pool.query = query;
  pool.getConnection = async () => {
    let snapshot, unlock;
    return { query, beginTransaction: async () => {
      const previous = mutex; mutex = new Promise(resolve => { unlock = resolve; }); await previous;
      snapshot = structuredClone(rows); events.push('begin');
    }, commit: async () => events.push('commit'), rollback: async () => { rows = snapshot; events.push('rollback'); },
    release: () => { events.push('release'); unlock?.(); } };
  };
});
afterEach(() => Object.assign(pool, originals));
async function start(input = { title: '  Review algebra  ' }) { return (await service.start(student, input)).session; }
async function act(session, action) { return (await service.transition(student, session.id, action, { version: session.version })).session; }

test('timer schema is idempotent and enforces one unfinished student through a MySQL unique generated key', async () => {
  await service.ensureStudyTimersTable(); await service.ensureStudyTimersTable();
  const sql = sqlCalls[0].sql;
  assert.match(sql, /CREATE TABLE IF NOT EXISTS study_session_timers/);
  assert.match(sql, /GENERATED ALWAYS AS \(CASE WHEN status IN \('running', 'paused'\) THEN 1 ELSE NULL END\) STORED/);
  assert.match(sql, /UNIQUE KEY uq_study_timer_unfinished \(student_id, unfinished_slot\)/);
  assert.match(sql, /REFERENCES student_assignments \(id\) ON DELETE SET NULL/);
  assert.match(sql, /REFERENCES `students` \(id\) ON DELETE CASCADE/);
  assert.match(sql, /student_id, owner_user_id, status, ended_at, id/);
  assert.equal(sqlCalls.length, 2);
});
test('timer starts from database time with server identity and never changes other study features', async () => {
  const session = await start({ title: '  Review  ', assignment_id: 12 });
  assert.equal(session.title, 'Review'); assert.equal(session.assignment_id, 12);
  assert.equal(session.elapsedSeconds, 0); assert.equal(session.started_at, now.toISOString());
  assert.equal(session.status, 'running'); assert.equal(session.version, 1);
  assert.match(sqlCalls[0].sql, /owner_user_id = \? AND student_id = \?.*FOR SHARE/);
  assert.ok(sqlCalls.every(call => !/UPDATE (student_assignments|students|study_goals|academic_support)/.test(call.sql)));
  assert.deepEqual(events, ['begin', 'commit', 'release']);
});
test('time spent waiting for a successful insert is excluded from the new timer', async () => {
  fail = sql => { if (sql.startsWith('INSERT INTO study_session_timers')) advance(45); return false; };
  const session = await start();
  assert.equal(session.started_at, '2026-09-08T10:00:45.000Z');
  assert.equal(session.elapsedSeconds, 0);
  advance(10); assert.equal((await service.current(student)).session.elapsedSeconds, 10);
});
test('simultaneous starts cannot produce two unfinished sessions, including two accounts linked to one student', async () => {
  const results = await Promise.allSettled([start(), start()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'STUDY_TIMER_UNFINISHED_EXISTS');
  assert.equal(rows.length, 1);
  const firstRead = sqlCalls.findIndex(call => call.sql.includes('LIMIT 1 FOR UPDATE'));
  assert.ok(sqlCalls.findIndex(call => call.sql.startsWith('INSERT')) < firstRead);
  await rejected(service.start({ ...student, id: 25 }, { title: 'Other account' }), 409);
  assert.equal((await service.current({ ...student, id: 25 })).session, null);
});
test('pause and resume preserve fractional duration and exclude paused time', async () => {
  let session = await start(); advance(90.125); session = await act(session, 'pause');
  assert.equal(session.elapsedSeconds, 90.125); assert.equal(session.running_since, null);
  advance(500); session = (await service.current(student)).session;
  assert.equal(session.elapsedSeconds, 90.125); assert.equal(session.version, 2);
  session = await act(session, 'resume'); advance(29.875); session = await act(session, 'finish');
  assert.equal(session.elapsedSeconds, 120); assert.equal(session.status, 'completed');
  assert.equal((await service.current(student)).session, null);
});
test('finish and duplicate action requests never double count, while stale versions return 409', async () => {
  const running = await start(); advance(100);
  const finished = await act(running, 'finish'); advance(1000);
  await rejected(service.transition(student, running.id, 'finish', { version: running.version }), 409, 'STUDY_TIMER_CONFLICT');
  assert.deepEqual(await act(finished, 'finish'), finished);
  await rejected(service.transition(student, finished.id, 'resume', { version: finished.version }), 409);
  assert.equal(rows[0].accumulated_seconds, 100);
  assert.equal((await start()).id, 2);
});
test('a refreshed current session recovers running elapsed time without changing its version', async () => {
  const running = await start(); advance(45);
  const first = await service.current(student); advance(15); const second = await service.current(student);
  assert.equal(first.session.elapsedSeconds, 45); assert.equal(second.session.elapsedSeconds, 60);
  assert.equal(second.session.version, running.version); assert.equal(second.serverNow, now.toISOString());
});
test('eight-hour read reconciliation pauses an abandoned timer and requires explicit finish or discard', async () => {
  const running = await start(); advance(3 * 86400);
  const current = await service.current(student);
  assert.equal(current.session.elapsedSeconds, 28800); assert.equal(current.session.status, 'paused');
  assert.equal(current.session.limitReached, true); assert.equal(current.session.version, 2);
  await rejected(service.transition(student, running.id, 'pause', { version: 1 }), 409);
  await rejected(service.transition(student, running.id, 'resume', { version: 2 }), 409, 'STUDY_TIMER_LIMIT_REACHED');
  const finished = await act(current.session, 'finish'); assert.equal(finished.elapsedSeconds, 28800);
  assert.equal(finished.ended_at, now.toISOString());
});
test('finish caps abandoned running duration even without an intervening read', async () => {
  const session = await start(); advance(100000);
  const finished = await act(session, 'finish'); assert.equal(finished.elapsedSeconds, 28800); assert.equal(finished.limitReached, true);
});
test('backwards database clocks preserve observed duration and pause rather than counting an interval twice', async () => {
  await start(); advance(120); await service.current(student); advance(-60);
  let session = (await service.current(student)).session;
  assert.equal(session.elapsedSeconds, 120); assert.equal(session.status, 'paused'); assert.equal(session.clockAdjusted, true);
  await rejected(service.transition(student, session.id, 'resume', { version: session.version }), 409, 'STUDY_TIMER_CLOCK_ADJUSTED');
  advance(70); session = await act(session, 'resume'); advance(10); session = await act(session, 'finish');
  assert.equal(session.elapsedSeconds, 130);
});
test('discard releases the unfinished constraint but preserves a closed excluded record', async () => {
  let session = await start(); advance(40); session = await act(session, 'discard');
  assert.equal(session.status, 'discarded'); assert.equal(session.elapsedSeconds, 40);
  await rejected(service.transition(student, session.id, 'finish', { version: session.version }), 409);
  assert.equal((await start()).status, 'running');
});
test('ownership and assignment authorization fail closed, including accounts sharing a student link', async () => {
  const session = await start();
  for (const actor of [other, { ...student, id: 22 }]) {
    assert.equal((await service.current(actor)).session, null);
    await rejected(service.transition(actor, session.id, 'finish', { version: 1 }), 404);
  }
  for (const actor of [null, { id: 20, role: 'student' }, { id: 10, role: 'admin', studentId: 7 }, { id: 30, role: 'teacher', studentId: 7 }]) {
    await rejected(service.current(actor), actor === null ? 401 : 403);
  }
  for (const actor of [student, other, { ...student, id: 22 }]) {
    await rejected(service.start(actor, { title: 'Linked', assignment_id: 99 }), 404, 'STUDY_TIMER_ASSIGNMENT_UNAVAILABLE');
  }
  await rejected(service.start(other, { title: 'Linked', assignment_id: 12 }), 404);
});
test('invalid writable fields, IDs, titles, versions and transitions are rejected', async () => {
  for (const input of [null, [], { title: '' }, { title: 'a'.repeat(151) }, { title: 'a\nb' }, ...['elapsedSeconds', 'ended_at', 'student_id', 'role', 'status'].map(key => ({ title: 'Study', [key]: 1 })), { title: 'Study', assignment_id: '1 OR 1=1' }]) {
    await rejected(service.start(student, input), 400);
  }
  const session = await start();
  for (const version of [0, -1, 1.1, Infinity, 4294967296, '2x', true]) await rejected(service.transition(student, session.id, 'pause', { version }), 400);
  await rejected(service.transition(student, '0', 'pause', { version: 1 }), 400);
  await rejected(service.transition(student, session.id, 'pause', { version: 1, elapsedSeconds: 1000 }), 400);
  await rejected(service.transition(student, session.id, 'unknown', { version: 1 }), 409);
});
test('transaction failure rolls back time and status together and releases the connection', async () => {
  const session = await start(); advance(50); fail = sql => sql.startsWith('UPDATE study_session_timers SET status');
  await assert.rejects(act(session, 'finish'));
  assert.equal(rows[0].status, 'running'); assert.equal(rows[0].accumulated_seconds, 0); assert.equal(rows[0].version, 1);
  assert.deepEqual(events.slice(-3), ['begin', 'rollback', 'release']);
});
test('completed-only SQL rollup groups the full duration by UTC completion date, not start date', async () => {
  now = new Date('2026-09-08T23:59:00Z'); let session = await start(); advance(120); await act(session, 'finish');
  session = await start(); advance(60); await act(session, 'discard');
  await start(); advance(60);
  const summary = await service.summary(student, { from: '2026-09-08', to: '2026-09-09' });
  assert.equal(summary.completedSessionCount, 1); assert.equal(summary.totalCompletedSeconds, 120); assert.equal(summary.averageCompletedSeconds, 120);
  assert.deepEqual(summary.daily.map(day => day.totalCompletedSeconds), [0, 120]);
  assert.equal(summary.timeZone, 'UTC'); assert.equal(summary.grouping, 'completion_date');
  assert.match(sqlCalls.at(-1).sql, /status = 'completed'.*GROUP BY DATE_FORMAT\(ended_at.*WITH ROLLUP/);
  assert.equal((await service.summary(other, {})).totalCompletedSeconds, 0);
});
test('history includes only terminal records and has deterministic bounded date and pagination filters', async () => {
  for (let i = 0; i < 3; i++) { const session = await start(); await act(session, i === 1 ? 'discard' : 'finish'); }
  await start();
  const history = await service.history(student, { from: '2026-09-08', to: '2026-09-08', size: 1, page: 2, status: 'completed' });
  assert.equal(history.pagination.total, 2); assert.equal(history.sessions[0].id, 1);
  assert.deepEqual(sqlCalls.at(-1).args, [7, 20, 'completed', '2026-09-08 00:00:00.000', '2026-09-09 00:00:00.000', 1, 1]);
  assert.match(sqlCalls.at(-1).sql, /ORDER BY ended_at DESC, id DESC LIMIT \? OFFSET \?/);
  for (const input of [{ from: '2026-02-30', to: '2026-03-02' }, { from: '2026-01-01' }, { from: '2026-01-01', to: '2026-12-31' }, { from: '2026-09-09', to: '2026-09-08' }, { size: 101 }, { page: 100001 }, { status: 'running' }, { student_id: 8 }]) await rejected(service.history(student, input), 400);
  await rejected(service.summary(student, { page: 2 }), 400);
});
test('duration corruption, non-finite clocks and version exhaustion fail closed', async () => {
  const session = await start();
  for (const value of [NaN, Infinity, -1, 28801]) assert.throws(() => validation.timerState({ ...rows[0], accumulated_seconds: value }, now));
  assert.throws(() => validation.timerState(rows[0], new Date(NaN)));
  rows[0].version = 4294967295;
  await rejected(service.transition(student, session.id, 'pause', { version: 4294967295 }), 409);
  assert.equal(rows[0].status, 'running');
});
