'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const express = require('express');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
const auth = require('../services/authService');
const service = require('../services/studyTimerService');
const { StudyTimerError, startInput, actionInput } = require('../utils/studyTimerValidation');
const { generateAccessToken } = require('../utils/jwtUtils');

test('timer HTTP routes enforce student-only fresh identity, thin dispatch, validation and safe errors', async t => {
  const originalAuth = auth.findById, originals = { ...service }, calls = [];
  let failure;
  auth.findById = async id => ({ id, role: id === 20 ? 'student' : id === 10 ? 'admin' : 'teacher', student_id: 7, is_active: id !== 40 });
  for (const key of ['current', 'start', 'transition', 'history', 'summary']) service[key] = async (...args) => {
    calls.push({ key, args });
    if (failure) throw failure;
    if (key === 'start') startInput(args[1]);
    if (key === 'transition') actionInput(args[3]);
    return { session: key === 'current' ? null : { id: 1, status: 'running', version: 1 } };
  };
  const app = express(); app.use(express.json()); app.use('/api', require('../routes/apiRoutes'));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = '/student/me/study-timers';
  const send = (method, path, actor, body) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${generateAccessToken({ id: actor, role: 'student', studentId: 999 })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    await t.test('unauthenticated, inactive, admin and teacher requests cannot access any timer operation', async () => {
      for (const [method, path] of [['GET', `${base}/current`], ['GET', base], ['GET', `${base}/summary`], ['POST', base], ...['pause', 'resume', 'finish', 'discard'].map(action => ['POST', `${base}/1/${action}`])]) {
        for (const actor of [undefined, 10, 30, 40]) assert.equal((await send(method, path, actor, method === 'POST' ? {} : undefined)).status, actor === undefined || actor === 40 ? 401 : 403);
      }
      assert.equal(calls.length, 0);
    });
    await t.test('start returns 201 with authenticated actor and rejects duration and ownership injection', async () => {
      const response = await send('POST', base, 20, { title: 'Practice', assignment_id: 12 });
      assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(calls.at(-1).args[0].studentId, 7); assert.equal(calls.at(-1).args[0].id, 20);
      assert.deepEqual(calls.at(-1).args[1], { title: 'Practice', assignment_id: 12 });
      assert.equal((await send('POST', base, 20, { title: 'Practice', elapsed_seconds: 999 })).status, 400);
      assert.equal((await send('POST', base, 20, { title: 'Practice', student_id: 999 })).status, 400);
    });
    await t.test('current, history, summary and all four actions dispatch without adding client authority', async () => {
      assert.equal((await send('GET', `${base}/current`, 20)).status, 200); assert.equal(calls.at(-1).key, 'current');
      for (const [path, key] of [[`${base}?page=2&size=20`, 'history'], [`${base}/summary?from=2026-09-01&to=2026-09-08`, 'summary']]) {
        assert.equal((await send('GET', path, 20)).status, 200); assert.equal(calls.at(-1).key, key);
      }
      for (const action of ['pause', 'resume', 'finish', 'discard']) {
        assert.equal((await send('POST', `${base}/1/${action}`, 20, { version: 2 })).status, 200);
        assert.deepEqual(calls.at(-1).args.slice(1), ['1', action, { version: 2 }]);
      }
      assert.equal((await send('DELETE', `${base}/1`, 20)).status, 404);
      assert.equal((await send('PATCH', `${base}/1`, 20, {})).status, 404);
    });
    await t.test('known conflicts are documented and unexpected database failures redact details', async () => {
      for (const status of [400, 403, 404, 409]) {
        failure = new StudyTimerError(status, 'STUDY_TIMER_CONFLICT', 'Safe error');
        const response = await send('GET', `${base}/current`, 20);
        assert.equal(response.status, status); assert.equal((await response.json()).code, 'STUDY_TIMER_CONFLICT');
      }
      failure = new Error('SELECT private FROM secret_table password=secret');
      const response = await send('GET', `${base}/current`, 20);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Failed to process study timer.', code: 'STUDY_TIMER_INTERNAL_ERROR' });
    });
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    auth.findById = originalAuth; Object.assign(service, originals);
  }
});
