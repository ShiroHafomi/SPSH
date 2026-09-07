'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const express = require('express');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
const authService = require('../services/authService');
const studentService = require('../services/studentService');
const mlService = require('../services/mlService');
const { generateAccessToken } = require('../utils/jwtUtils');

const student = {
  id: 1, student_id: 'STU001', gender: 'Female', age: 19,
  study_hours_per_day: 3, attendance_percent: 90, sleep_hours: 7,
  previous_gpa: 3.2, parental_education: 'Bachelor', internet_access: 1,
  extracurricular: 0, part_time_job: 0,
};

test('serving admin route requires authenticated admin POST and ignores body identity', async t => {
  const originalAuth = authService.findById;
  const originalFind = studentService.findById;
  const originalUpdate = studentService.updateStudent;
  const originalPredict = mlService.predictForStudent;
  let attempts = 0;
  authService.findById = async id => ({ id, role: id === 10 ? 'admin' : 'teacher', is_active: 1 });
  studentService.findById = async id => ({ ...student, id });
  studentService.updateStudent = async () => true;
  mlService.predictForStudent = async () => {
    attempts++;
    return { final_score: 85, grade: 'B', grade_confidence: 1, grade_probabilities: { B: 1 } };
  };
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/apiRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/admin/students`;
  const token = id => generateAccessToken({ id, role: 'admin' });
  const send = (method, id, actor, body) => fetch(`${base}/${id}/intervention`, {
    method,
    headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${token(actor)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    await t.test('unauthenticated request returns 401 even with an admin body', async () => {
      assert.equal((await send('POST', 1, null, { role: 'admin', actorId: 10 })).status, 401);
      assert.equal(attempts, 0);
    });
    await t.test('fresh authenticated role overrides both token claims and body', async () => {
      assert.equal((await send('POST', 1, 20, { role: 'admin', actorId: 10 })).status, 403);
      assert.equal(attempts, 0);
    });
    await t.test('GET never generates an intervention', async () => {
      assert.equal((await send('GET', 1, 10)).status, 404);
      assert.equal(attempts, 0);
    });
    for (const id of [1, 2]) {
      await t.test(`POST generates student ${id} using one prediction`, async () => {
        const response = await send('POST', id, 10, { studentId: 99, actorId: 20, role: 'teacher' });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.studentId, id);
        assert.match(result.interventionNote, /AI INTERVENTION NOTE/);
        assert.equal(attempts, id);
      });
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    authService.findById = originalAuth;
    studentService.findById = originalFind;
    studentService.updateStudent = originalUpdate;
    mlService.predictForStudent = originalPredict;
  }
});
