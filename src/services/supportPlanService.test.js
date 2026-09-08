'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const auth = require('./authService');
const notifications = require('./notificationService');
const service = require('./supportPlanService');

const admin = { id: 10, role: 'admin' };
const student = { id: 20, role: 'student', studentId: 1 };
const draft = () => ({ title: 'Support', objective: 'Practice regularly', start_date: '2026-09-01', due_date: '2026-09-30',
  tasks: [{ title: 'Review notes', description: 'Use active recall', due_date: '2026-09-10' }, { title: 'Practice questions' }] });
const originals = { query: pool.query, connection: pool.getConnection, audit: auth.logAuditEvent,
  recipient: auth.findUniqueActiveStudentUserId, preferences: notifications.getNotificationPreferences,
  notify: notifications.createNotification };
let plans, tasks, events, queries, notificationCalls, auditCalls, failTask, failQuery, taskSequence;

async function query(sql, args = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  queries.push({ sql: text, args });
  assert.doesNotMatch(text, /SELECT\s+\*/i);
  if (failQuery && failQuery(text)) throw new Error('private SQL password=/secret');
  if (text.startsWith('CREATE TABLE')) return [{}];
  if (text.startsWith('SELECT id FROM `')) return [args[0] === 999 ? [] : [{ id: args[0] }]];
  if (text.startsWith('INSERT INTO academic_support_plans')) {
    const id = plans.length + 1;
    plans.push({ id, student_id: args[0], created_by_user_id: args[1], title: args[2], objective: args[3],
      start_date: args[4], due_date: args[5], status: 'draft', version: 1, completed_at: null });
    return [{ insertId: id, affectedRows: 1 }];
  }
  if (text.startsWith('INSERT INTO academic_support_tasks')) {
    if (failTask && args[4] === 1) throw new Error('private task insert failure');
    tasks.push({ id: ++taskSequence, plan_id: args[0], title: args[1], description: args[2], due_date: args[3],
      sort_order: args[4], status: 'pending', version: 1, completed_at: null });
    return [{ affectedRows: 1 }];
  }
  if (text.startsWith('SELECT COUNT(*) AS total')) {
    return [[{ total: filterPlans(text, args).length }]];
  }
  if (text.startsWith('SELECT p.id')) {
    if (text.includes('WHERE p.id = ?')) {
      const plan = plans.find(row => row.id === args[0] && row.student_id === args[1] && (!text.includes("p.status <> 'draft'") || row.status !== 'draft'));
      return [plan ? [structuredClone(plan)] : []];
    }
    return [filterPlans(text, args).slice(args.at(-1), args.at(-1) + args.at(-2)).map(row => ({ ...row,
      totalTaskCount: tasks.filter(t => t.plan_id === row.id).length,
      completedTaskCount: tasks.filter(t => t.plan_id === row.id && t.status === 'completed').length }))];
  }
  if (text.startsWith('SELECT id, plan_id')) return [structuredClone(tasks.filter(task => task.plan_id === args[0]).sort((a, b) => a.sort_order - b.sort_order))];
  if (text.startsWith('DELETE FROM academic_support_tasks')) {
    tasks = tasks.filter(task => task.plan_id !== args[0]); return [{ affectedRows: 1 }];
  }
  if (text.startsWith('UPDATE academic_support_plans')) {
    const id = args.at(-3), owner = args.at(-2), version = args.at(-1);
    const plan = plans.find(row => row.id === id && row.student_id === owner && row.version === version);
    if (!plan) return [{ affectedRows: 0 }];
    if (text.includes('SET title')) Object.assign(plan, { title: args[0], objective: args[1], start_date: args[2], due_date: args[3] });
    if (text.includes('SET status')) { plan.status = args[0]; plan.completed_at = args[0] === 'completed' ? '2026-09-10 00:00:00' : null; }
    plan.version += 1;
    return [{ affectedRows: 1 }];
  }
  if (text.startsWith('UPDATE academic_support_tasks')) {
    const task = tasks.find(row => row.id === args[1] && row.plan_id === args[2] && row.version === args[3]);
    if (!task) return [{ affectedRows: 0 }];
    task.status = args[0]; task.version += 1; task.completed_at = args[0] === 'completed' ? '2026-09-10 00:00:00' : null;
    return [{ affectedRows: 1 }];
  }
  throw new Error(`Unhandled test SQL: ${text}`);
}
function filterPlans(sql, args) {
  return plans.filter(p => p.student_id === args[0] && (!sql.includes("p.status <> 'draft'") || p.status !== 'draft') && (!sql.includes('p.status = ?') || p.status === args[1]));
}

beforeEach(() => {
  plans = []; tasks = []; events = []; queries = []; notificationCalls = []; auditCalls = [];
  failTask = false; failQuery = null; taskSequence = 0;
  pool.query = query;
  pool.getConnection = async () => {
    let snapshot;
    return { query, beginTransaction: async () => { events.push('begin'); snapshot = structuredClone({ plans, tasks }); },
      commit: async () => events.push('commit'), rollback: async () => { events.push('rollback'); plans = snapshot.plans; tasks = snapshot.tasks; },
      release: () => events.push('release') };
  };
  auth.logAuditEvent = async value => { events.push('audit'); auditCalls.push(value); };
  auth.findUniqueActiveStudentUserId = async () => 20;
  notifications.getNotificationPreferences = async () => ({ teacherFeedback: true });
  notifications.createNotification = async value => { events.push('notification'); notificationCalls.push(value); return { created: true }; };
});
afterEach(() => {
  pool.query = originals.query; pool.getConnection = originals.connection;
  auth.logAuditEvent = originals.audit; auth.findUniqueActiveStudentUserId = originals.recipient;
  notifications.getNotificationPreferences = originals.preferences; notifications.createNotification = originals.notify;
});
const rejects = (promise, status, code) => assert.rejects(promise, error => error.status === status && (!code || error.code === code));
async function active() {
  const { plan } = await service.createPlan(admin, 1, draft());
  return (await service.transitionPlan(admin, 1, plan.id, 'activate', { version: plan.version })).plan;
}

test('support initialization uses idempotent tables, safe foreign keys and retrieval indexes', async () => {
  await service.ensureSupportPlanTables();
  assert.equal(queries.length, 2);
  assert.ok(queries.every(item => item.sql.includes('CREATE TABLE IF NOT EXISTS')));
  assert.match(queries[0].sql, /REFERENCES `students` \(id\) ON DELETE CASCADE/);
  assert.match(queries[0].sql, /REFERENCES users \(id\) ON DELETE SET NULL/);
  assert.match(queries[0].sql, /student_id, status, created_at, id/);
  assert.match(queries[1].sql, /FOREIGN KEY \(plan_id\) REFERENCES academic_support_plans/);
});

test('support creates a draft and tasks atomically, without ML or notifications', async () => {
  const { plan } = await service.createPlan(admin, 1, draft());
  assert.equal(plan.status, 'draft'); assert.equal(plan.totalTaskCount, 2); assert.equal(plan.progressPercent, 0);
  assert.deepEqual(events, ['begin', 'commit', 'release', 'audit']);
  assert.equal(notificationCalls.length, 0);
  assert.equal(auditCalls[0].metadata.objective, undefined);
  assert.equal(auditCalls[0].metadata.tasks, undefined);
  assert.equal(plan.created_by_user_id, admin.id);
  assert.deepEqual(plan.tasks.map(t => t.sort_order), [0, 1]);
});

test('support rolls back the plan and prior tasks on partial creation failure', async () => {
  failTask = true;
  await assert.rejects(service.createPlan(admin, 1, draft()));
  assert.equal(plans.length, 0); assert.equal(tasks.length, 0);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
  assert.equal(auditCalls.length, 0);
});

test('support rejects missing students and unknown body ownership before creation', async () => {
  await rejects(service.createPlan(admin, 999, draft()), 404);
  await rejects(service.createPlan(admin, 1, { ...draft(), student_id: 2 }), 400);
  assert.equal(plans.length, 0);
});

test('support denies unauthenticated actors, teachers, and student management', async () => {
  for (const actor of [null, { role: 'admin' }]) await rejects(service.listPlans(actor, 1), 401);
  for (const actor of [{ id: 30, role: 'teacher', studentId: 1 }, student, { id: 40, role: 'user' }]) {
    await rejects(service.createPlan(actor, 1, draft()), 403);
  }
  await rejects(service.listPlans({ id: 30, role: 'teacher' }, 1), 403);
  await rejects(service.listPlans({ id: 20, role: 'student' }), 403);
  assert.equal(queries.length, 0);
});

test('support students cannot see drafts or another student plan, regardless of supplied scope', async () => {
  await service.createPlan(admin, 1, draft());
  await rejects(service.getPlan(student, 1, 1), 404);
  assert.equal((await service.listPlans(student, 1)).total, 0);
  await service.transitionPlan(admin, 1, 1, 'activate', { version: 1 });
  assert.equal((await service.getPlan(student, 999, 1)).student_id, 1);
  await rejects(service.getPlan({ ...student, studentId: 2 }, 1, 1), 404);
  assert.equal((await service.listPlans({ ...student, studentId: 2 }, 1)).total, 0);
});

test('support draft editing is versioned and task replacement rolls back on failure', async () => {
  await service.createPlan(admin, 1, draft());
  const saved = await service.editPlan(admin, 1, 1, { ...draft(), title: 'New title', version: 1 });
  assert.equal(saved.plan.version, 2); assert.equal(saved.plan.tasks.length, 2);
  await rejects(service.editPlan(admin, 1, 1, { ...draft(), version: 1 }), 409, 'SUPPORT_PLAN_CONFLICT');
  failTask = true;
  await assert.rejects(service.editPlan(admin, 1, 1, { ...draft(), version: 2 }));
  assert.equal(plans[0].title, 'New title'); assert.equal(plans[0].version, 2); assert.equal(tasks.length, 2);
});

test('support activation requires tasks and legal transitions', async () => {
  await service.createPlan(admin, 1, { ...draft(), tasks: [] });
  await rejects(service.transitionPlan(admin, 1, 1, 'activate', { version: 1 }), 409, 'SUPPORT_PLAN_INVALID_TRANSITION');
  await rejects(service.transitionPlan(admin, 1, 1, 'complete', { version: 1 }), 409);
  await rejects(service.transitionPlan(admin, 1, 1, 'unknown', { version: 1 }), 409);
  await service.transitionPlan(admin, 1, 1, 'cancel', { version: 1 });
  await rejects(service.editPlan(admin, 1, 1, { ...draft(), version: 2 }), 409);
  await rejects(service.transitionPlan(admin, 1, 1, 'activate', { version: 2 }), 409);
});

test('support activation notifies only after commit and repeated activation cannot notify twice', async () => {
  const plan = await active();
  assert.equal(plan.status, 'active');
  assert.equal(notificationCalls.length, 1);
  assert.deepEqual(notificationCalls[0], { userId: 20, type: 'support_plan_activated', metadata: { planId: 1 } });
  assert.ok(events.lastIndexOf('commit') < events.indexOf('notification'));
  await rejects(service.transitionPlan(admin, 1, 1, 'activate', { version: 1 }), 409);
  await rejects(service.transitionPlan(admin, 1, 1, 'activate', { version: 2 }), 409);
  assert.equal(notificationCalls.length, 1);
});

test('support notification preference, absent recipient and optional failures preserve activation', async () => {
  await service.createPlan(admin, 1, draft());
  notifications.createNotification = async () => { throw new Error('private delivery failure'); };
  auth.logAuditEvent = async () => { throw new Error('private audit failure'); };
  const result = await service.transitionPlan(admin, 1, 1, 'activate', { version: 1 });
  assert.equal(result.plan.status, 'active');
  assert.deepEqual(result.warnings, ['SUPPORT_PLAN_AUDIT_FAILED', 'SUPPORT_PLAN_NOTIFICATION_FAILED']);
  assert.equal(events.filter(e => e === 'rollback').length, 0);
  auth.logAuditEvent = async () => {};
  await service.createPlan(admin, 1, draft());
  auth.findUniqueActiveStudentUserId = async () => null;
  assert.deepEqual((await service.transitionPlan(admin, 1, 2, 'activate', { version: 1 })).warnings, ['SUPPORT_PLAN_RECIPIENT_UNAVAILABLE']);
  await service.createPlan(admin, 1, draft());
  auth.findUniqueActiveStudentUserId = async () => 20;
  notifications.getNotificationPreferences = async () => ({ teacherFeedback: false });
  assert.deepEqual((await service.transitionPlan(admin, 1, 3, 'activate', { version: 1 })).warnings, []);
});

test('support own active task updates require membership and both current versions', async () => {
  const plan = await active();
  await rejects(service.updateTask(student, null, 1, 999, { version: 1, planVersion: 2, status: 'completed' }), 404);
  await service.createPlan(admin, 1, draft());
  await rejects(service.updateTask(student, null, 1, tasks.at(-1).id, { version: 1, planVersion: 2, status: 'completed' }), 404);
  await rejects(service.updateTask({ ...student, studentId: 2 }, null, 1, 1, { version: 1, planVersion: 2, status: 'completed' }), 404);
  await rejects(service.updateTask(student, null, 1, 1, { version: 2, planVersion: 2, status: 'completed' }), 409);
  await rejects(service.updateTask(student, null, 1, 1, { version: 1, planVersion: 1, status: 'completed' }), 409);
  const result = await service.updateTask(student, null, 1, plan.tasks[0].id, { version: 1, planVersion: 2, status: 'completed' });
  assert.equal(result.plan.version, 3); assert.equal(result.plan.tasks[0].version, 2); assert.equal(result.plan.progressPercent, 50);
  assert.match(queries.find(q => q.sql.startsWith('UPDATE academic_support_tasks')).sql, /WHERE id = \? AND plan_id = \? AND version = \?/);
  assert.ok(queries.some(q => q.sql.includes('FOR UPDATE')));
});

test('support task status cannot change ownership or content and closed plans are immutable', async () => {
  await active();
  for (const field of ['title', 'student_id', 'plan_id', 'due_date', 'role']) {
    await rejects(service.updateTask(student, null, 1, 1, { status: 'completed', version: 1, planVersion: 2, [field]: 99 }), 400);
  }
  await rejects(service.editPlan(admin, 1, 1, { ...draft(), version: 2 }), 409);
  await service.transitionPlan(admin, 1, 1, 'cancel', { version: 2 });
  await rejects(service.updateTask(student, null, 1, 1, { status: 'completed', version: 1, planVersion: 3 }), 409);
  assert.equal((await service.getPlan(student, null, 1)).status, 'cancelled');
});

test('support completion requires all tasks and 100 percent stays active until staff acts', async () => {
  await active();
  await rejects(service.transitionPlan(admin, 1, 1, 'complete', { version: 2 }), 409);
  await service.updateTask(student, null, 1, 1, { status: 'completed', version: 1, planVersion: 2 });
  const full = await service.updateTask(student, null, 1, 2, { status: 'completed', version: 1, planVersion: 3 });
  assert.equal(full.plan.progressPercent, 100); assert.equal(full.plan.status, 'active');
  await rejects(service.transitionPlan(admin, 1, 1, 'complete', { version: 3 }), 409);
  const done = await service.transitionPlan(admin, 1, 1, 'complete', { version: 4 });
  assert.equal(done.plan.status, 'completed'); assert.ok(done.plan.completed_at);
  await rejects(service.updateTask(student, null, 1, 1, { status: 'pending', version: 2, planVersion: 5 }), 409);
  await rejects(service.editPlan(admin, 1, 1, { ...draft(), version: 5 }), 409);
});

test('support reopening an active task clears its completion and repeating status is a no-op', async () => {
  await active();
  await service.updateTask(student, null, 1, 1, { status: 'completed', version: 1, planVersion: 2 });
  const same = await service.updateTask(student, null, 1, 1, { status: 'completed', version: 2, planVersion: 3 });
  assert.equal(same.plan.version, 3);
  const reopened = await service.updateTask(student, null, 1, 1, { status: 'in_progress', version: 2, planVersion: 3 });
  assert.equal(reopened.plan.tasks[0].completed_at, null); assert.equal(reopened.plan.progressPercent, 0);
});

test('support task and parent changes roll back together if the parent update fails', async () => {
  await active();
  failQuery = sql => sql.startsWith('UPDATE academic_support_plans SET version');
  await assert.rejects(service.updateTask(student, null, 1, 1, { status: 'completed', version: 1, planVersion: 2 }));
  assert.equal(tasks[0].status, 'pending');
  assert.equal(tasks[0].version, 1);
  assert.equal(plans[0].version, 2);
  assert.equal(events.at(-2), 'rollback');
  assert.equal(events.at(-1), 'release');
});

test('support inactive or unlinked students and cross-student admin paths cannot mutate a plan', async () => {
  await active();
  await rejects(service.getPlan({ ...student, studentId: null }, 1, 1), 403);
  await rejects(service.transitionPlan(admin, 2, 1, 'cancel', { version: 2 }), 404);
  await rejects(service.updateTask(admin, 2, 1, 1, { status: 'completed', version: 1, planVersion: 2 }), 404);
  assert.equal(plans[0].status, 'active');
  assert.equal(tasks[0].status, 'pending');
});

test('support version exhaustion fails closed without overflow or optional side effects', async () => {
  await active();
  plans[0].version = 4294967295;
  const audits = auditCalls.length;
  await rejects(service.transitionPlan(admin, 1, 1, 'cancel', { version: 4294967295 }), 409);
  assert.equal(plans[0].status, 'active');
  assert.equal(auditCalls.length, audits);
  assert.equal(notificationCalls.length, 1);
});

test('support list SQL binds owner/filter/pagination and uses deterministic bounded order', async () => {
  await active();
  const result = await service.listPlans(student, 999, { status: 'active', page: 1, size: 20 });
  assert.equal(result.total, 1); assert.equal(result.plans[0].totalTaskCount, 2);
  const sql = queries.at(-1);
  assert.deepEqual(sql.args, [1, 'active', 20, 0]);
  assert.match(sql.sql, /ORDER BY p.created_at DESC, p.id DESC LIMIT \? OFFSET \?/);
  await rejects(service.listPlans(admin, 1, { status: "active' OR 1=1" }), 400);
  await rejects(service.listPlans(admin, 1, { size: 101 }), 400);
});
