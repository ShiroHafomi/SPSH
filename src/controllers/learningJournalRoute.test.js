'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
const auth = require('../services/authService');
const service = require('../services/learningJournalService');
const { JournalError, entryInput, listInput, deleteInput } = require('../utils/learningJournalValidation');
const { generateAccessToken } = require('../utils/jwtUtils');
const { createRequestProvenanceMiddleware, createSecurityConfig } = require('../config/security');
const body = { title: 'Reflection', entry_date: '2026-09-08', learned_text: 'A private reflection' };

test('journal HTTP endpoints enforce authentication, privacy, validation, conflicts and safe failures', async t => {
  const calls = [], logs = []; let failure;
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(auth, 'findById', async id => ({ id, role: id === 20 ? 'student' : id === 10 ? 'admin' : 'teacher', student_id: 7, is_active: id !== 40 }));
  for (const key of ['list', 'get', 'create', 'update', 'remove']) t.mock.method(service, key, async (...args) => {
    calls.push({ key, args }); if (failure) throw failure;
    if (key === 'list') listInput(args[1]);
    if (key === 'create') entryInput(args[1], '2026-09-08');
    if (key === 'update') entryInput(args[2], '2026-09-08', true);
    if (key === 'remove') deleteInput(args[2]);
    return { ok: true, id: 1, version: 1 };
  });
  const app = express(); app.use(express.json()); app.use(require('cookie-parser')());
  app.use(createRequestProvenanceMiddleware(createSecurityConfig())); app.use('/api', require('../routes/apiRoutes'));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/student/me/learning-journal`;
  const send = (method, suffix = '', id, data, extra = {}) => fetch(base + suffix, { method, headers: { 'content-type': 'application/json', ...(id ? { authorization: `Bearer ${generateAccessToken({ id, role: 'admin', student_id: 999 })}` } : {}), ...extra }, body: data === undefined ? undefined : JSON.stringify(data) });
  try {
    await t.test('all five endpoints deny unauthenticated, inactive and staff users', async () => {
      for (const [method, suffix, data] of [['GET', '', undefined], ['GET', '/1', undefined], ['POST', '', body], ['PATCH', '/1', { ...body, version: 1 }], ['DELETE', '/1?version=1', undefined]]) {
        for (const id of [undefined, 10, 30, 40]) assert.equal((await send(method, suffix, id, data)).status, id === undefined || id === 40 ? 401 : 403);
      }
      assert.equal(calls.length, 0);
    });
    await t.test('fresh authenticated identity is dispatched, all responses are private and operations work', async () => {
      for (const [method, suffix, data, key, status] of [['GET', '', undefined, 'list', 200], ['GET', '/1', undefined, 'get', 200], ['POST', '', body, 'create', 201], ['PATCH', '/1', { ...body, version: 1 }, 'update', 200], ['DELETE', '/1?version=1', undefined, 'remove', 200]]) {
        const response = await send(method, suffix, 20, data);
        assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(calls.at(-1).key, key); assert.equal(calls.at(-1).args[0].studentId, 7); assert.equal(calls.at(-1).args[0].id, 20);
      }
    });
    await t.test('unknown writable fields and invalid dates/versions/filters return 400', async () => {
      assert.equal((await send('POST', '', 20, { ...body, owner_user_id: 21 })).status, 400);
      assert.equal((await send('PATCH', '/1', 20, { ...body, version: 1, student_id: 7 })).status, 400);
      assert.equal((await send('POST', '', 20, { ...body, entry_date: '2026-09-09' })).status, 400);
      assert.equal((await send('DELETE', '/1?version=0', 20)).status, 400);
      assert.equal((await send('GET', '?size=101', 20)).status, 400);
    });
    await t.test('cookie-authenticated writes inherit provenance protection', async () => {
      const response = await send('POST', '', undefined, body, { cookie: `access_token=${generateAccessToken({ id: 20, role: 'student' })}`, origin: 'https://untrusted.invalid' });
      assert.equal(response.status, 403);
    });
    await t.test('safe conflict/not-found and database errors never include private text in responses or logs', async () => {
      failure = new JournalError(409, 'JOURNAL_CONFLICT', 'This entry changed.');
      let response = await send('PATCH', '/1', 20, { ...body, version: 1 }); assert.equal(response.status, 409);
      failure = new JournalError(404, 'JOURNAL_NOT_FOUND', 'Journal entry not found.');
      response = await send('GET', '/1', 20); assert.equal(response.status, 404);
      failure = new Error('SQL secret: private journal text');
      response = await send('GET', '/1', 20); assert.equal(response.status, 500); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'Unable to process the journal request.', code: 'JOURNAL_INTERNAL_ERROR' });
      assert.equal(JSON.stringify(logs).includes('private journal text'), false);
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('journal URLs including private search terms are excluded from application request logging', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(source, /skip: req => .*learning-journal.*\/i\.test\(req.path\)/);
  const controller = fs.readFileSync(path.join(__dirname, 'learningJournalController.js'), 'utf8');
  assert.doesNotMatch(controller, /logAuditEvent|console\.error\([^\n]*error[,.]/);
});
