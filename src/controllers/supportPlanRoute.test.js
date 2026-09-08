'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const express = require('express');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
const auth = require('../services/authService');
const service = require('../services/supportPlanService');
const { SupportPlanError, validateDraft } = require('../utils/supportPlanValidation');
const { generateAccessToken } = require('../utils/jwtUtils');

test('support HTTP routes enforce fresh roles, server identity and safe response contracts', async t => {
  const originalAuth = auth.findById;
  const originals = Object.fromEntries(['listPlans', 'getPlan', 'createPlan', 'editPlan', 'transitionPlan', 'updateTask'].map(key => [key, service[key]]));
  const calls = [];
  let failure;
  auth.findById = async id => ({ id, role: id === 10 ? 'admin' : id === 20 ? 'student' : 'teacher', student_id: id === 20 ? 7 : null, is_active: true });
  for (const key of Object.keys(originals)) {
    service[key] = async (...args) => {
      calls.push({ key, args });
      if (failure) throw failure;
      if (key === 'createPlan') validateDraft(args[2]);
      if (key === 'listPlans') return { plans: [], total: 0, page: 1, size: 20, totalPages: 0 };
      if (key === 'getPlan') return { id: 1, tasks: [] };
      return { plan: { id: 1, tasks: [] }, warnings: [] };
    };
  }
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/apiRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = (method, path, actor, body) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${generateAccessToken({ id: actor, role: 'admin', studentId: 999 })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const adminPath = '/admin/students/7/support-plans';
  const studentPath = '/student/me/support-plans';
  const draft = { title: 'Support', objective: 'Practice', start_date: '2026-09-01', due_date: '2026-09-30', tasks: [] };
  try {
    await t.test('missing authentication and forged admin claims do not reach business operations', async () => {
      assert.equal((await send('GET', adminPath)).status, 401);
      for (const actor of [20, 30]) {
        assert.equal((await send('POST', adminPath, actor, { ...draft, role: 'admin', actorId: 10 })).status, 403);
        assert.equal((await send('GET', adminPath, actor)).status, 403);
      }
      assert.equal((await send('GET', studentPath, 30)).status, 403);
      assert.equal(calls.length, 0);
    });
    await t.test('admin creates draft with route scope and authenticated identity', async () => {
      const response = await send('POST', adminPath, 10, draft);
      assert.equal(response.status, 201);
      assert.equal((await response.json()).plan.id, 1);
      assert.equal(calls.at(-1).args[0].id, 10);
      assert.equal(calls.at(-1).args[0].role, 'admin');
      assert.equal(calls.at(-1).args[1], '7');
      assert.equal((await send('POST', adminPath, 10, { ...draft, student_id: 9 })).status, 400);
    });
    await t.test('list and detail retain documented envelopes', async () => {
      const list = await send('GET', `${adminPath}?page=2&size=20&status=active`, 10);
      assert.equal(list.status, 200);
      assert.deepEqual((await list.json()).plans, []);
      assert.deepEqual(calls.at(-1).args[2], { page: '2', size: '20', status: 'active' });
      const detail = await send('GET', `${studentPath}/1`, 20);
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).plan.id, 1);
      assert.equal(calls.at(-1).args[0].studentId, 7);
      assert.equal(calls.at(-1).args[1], undefined);
    });
    await t.test('all lifecycle and draft editing endpoints dispatch with current versions', async () => {
      assert.equal((await send('PATCH', `${adminPath}/1`, 10, { ...draft, version: 1 })).status, 200);
      assert.equal(calls.at(-1).key, 'editPlan');
      for (const action of ['activate', 'complete', 'cancel']) {
        assert.equal((await send('POST', `${adminPath}/1/${action}`, 10, { version: 2 })).status, 200);
        assert.equal(calls.at(-1).key, 'transitionPlan');
        assert.equal(calls.at(-1).args[3], action);
        assert.deepEqual(calls.at(-1).args[4], { version: 2 });
      }
    });
    await t.test('students can dispatch own task status but have no management or delete endpoint', async () => {
      const update = { status: 'completed', version: 1, planVersion: 2 };
      assert.equal((await send('PATCH', `${studentPath}/1/tasks/5`, 20, update)).status, 200);
      const call = calls.at(-1);
      assert.equal(call.key, 'updateTask');
      assert.equal(call.args[0].studentId, 7);
      assert.deepEqual(call.args.slice(1), [undefined, '1', '5', update]);
      const count = calls.length;
      for (const [method, path] of [['POST', studentPath], ['PATCH', `${studentPath}/1`], ['POST', `${studentPath}/1/activate`], ['DELETE', `${studentPath}/1`]]) {
        assert.equal((await send(method, path, 20, {})).status, 404);
      }
      assert.equal((await send('DELETE', `${adminPath}/1`, 10)).status, 404);
      assert.equal((await send('GET', '/teacher/students/7/support-plans', 30)).status, 404);
      assert.equal(calls.length, count);
    });
    await t.test('known errors preserve status and code; unexpected database errors are redacted', async () => {
      for (const [status, code] of [[400, 'SUPPORT_PLAN_INVALID_INPUT'], [403, 'SUPPORT_PLAN_FORBIDDEN'], [404, 'SUPPORT_PLAN_NOT_FOUND'], [409, 'SUPPORT_PLAN_CONFLICT']]) {
        failure = new SupportPlanError(status, code, 'Safe message');
        const response = await send('GET', `${adminPath}/1`, 10);
        assert.equal(response.status, status);
        assert.equal((await response.json()).code, code);
      }
      failure = new Error('SELECT private_student FROM private_table password=secret');
      const response = await send('GET', `${adminPath}/1`, 10);
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.deepEqual(body, { error: 'Failed to process support plan.', code: 'SUPPORT_PLAN_INTERNAL_ERROR' });
      assert.doesNotMatch(JSON.stringify(body), /SELECT|password|private_table/);
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    auth.findById = originalAuth;
    Object.assign(service, originals);
  }
});
