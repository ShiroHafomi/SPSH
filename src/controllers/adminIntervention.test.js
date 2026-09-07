'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const runner = require('../utils/mlRunner');
let inference;
const realRunInference = runner.runInference;
runner.runInference = async input => inference(input);
const studentService = require('../services/studentService');
const mlService = require('../services/mlService');
const authService = require('../services/authService');
const { pool } = require('../config/db');
const schema = require('../utils/schemaMap');
const { MlDependencyError } = require('../utils/mlErrors');
const { apiAdminGenerateIntervention } = require('./adminController');
const counsel = require('../services/aiCounselService');
runner.runInference = realRunInference;

const student = {
  id: 1, student_id: 'STU001', name: 'Test Student', gender: 'Female', age: 19,
  study_hours_per_day: '1.5', attendance_percent: 65, sleep_hours: '5.0',
  previous_gpa: '2.1', parental_education: 'Bachelor', internet_access: 1,
  extracurricular: 0, part_time_job: '0',
};
const prediction = { final_score: 72.5, grade: 'C', grade_confidence: 0.8, grade_probabilities: { B: 0.2, C: 0.8 } };
const originals = {};
let calls;

beforeEach(() => {
  for (const method of ['findById', 'updateStudent']) originals[method] = studentService[method];
  originals.canAccess = authService.canAccessStudent;
  originals.query = pool.query;
  originals.display = schema.getDisplayColumns;
  calls = { lookup: [], inference: [], save: [] };
  studentService.findById = async id => { calls.lookup.push(id); return { ...student, id }; };
  studentService.updateStudent = async (id, data) => { calls.save.push({ id, data }); return true; };
  inference = async input => { calls.inference.push(input); return prediction; };
});

afterEach(() => {
  studentService.findById = originals.findById;
  studentService.updateStudent = originals.updateStudent;
  authService.canAccessStudent = originals.canAccess;
  pool.query = originals.query;
  schema.getDisplayColumns = originals.display;
});

async function request(id = '1', user = { id: 10, role: 'admin' }, body = {}) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await apiAdminGenerateIntervention({ params: { id }, user, body }, res);
  return res;
}

for (const id of [1, 2]) {
  test(`valid admin intervention for student ${id} runs exactly once and returns the existing response`, async () => {
    const res = await request(String(id));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.studentId, id);
    assert.equal(res.body.student_id, 'STU001');
    assert.match(res.body.interventionNote, /AI INTERVENTION NOTE/);
    assert.match(res.body.interventionNote, /Confidence: 80.0%/);
    assert.doesNotMatch(res.body.interventionNote, /Work-Study Balance Plan/);
    assert.deepEqual(res.body.prediction, prediction);
    assert.ok(Number.isFinite(res.body.riskAssessment.riskScore));
    assert.equal(res.body.interventionStored, true);
    assert.equal(res.body.persistenceCode, null);
    assert.deepEqual(calls.lookup, [id]);
    assert.equal(calls.inference.length, 1);
    assert.equal(calls.inference[0].study_hours_per_day, 1.5);
    assert.deepEqual(calls.save, [{ id, data: { notes: res.body.interventionNote } }]);
    assert.doesNotMatch(JSON.stringify(res.body), /NaN|Infinity|undefined|Invalid Date/);
  });
}

test('invalid IDs fail before lookup and inference', async () => {
  for (const id of ['0', '-1', '1.5', '1abc', '9007199254740992', '1 OR 1=1']) {
    assert.equal((await request(id)).statusCode, 400);
  }
  assert.equal(calls.lookup.length, 0);
  assert.equal(calls.inference.length, 0);
});

test('missing authentication and unauthorized roles cannot be overridden by body identity', async () => {
  const body = { id: 10, userId: 10, actorId: 10, role: 'admin', user: { id: 10, role: 'admin' } };
  assert.equal((await request('1', null, body)).statusCode, 401);
  for (const role of ['student', 'teacher', 'user']) {
    assert.equal((await request('1', { id: 3, role }, body)).statusCode, 403);
  }
  assert.equal(calls.lookup.length, 0);
});

test('student access uses server-side actor and ignores request body', async () => {
  const user = { id: 10, role: 'admin' };
  authService.canAccessStudent = (actor, id) => {
    assert.equal(actor, user);
    assert.equal(id, 2);
    return false;
  };
  assert.equal((await request('2', user, { actorId: 20, studentId: 1 })).statusCode, 403);
  assert.equal(calls.lookup.length, 0);
});

test('missing student returns 404 without inference', async () => {
  studentService.findById = async () => null;
  assert.equal((await request()).statusCode, 404);
  assert.equal(calls.inference.length, 0);
});

test('missing and non-finite required data returns a safe 422 before inference', async () => {
  for (const value of [undefined, null, NaN, Infinity, 'invalid', -1, ' ']) {
    studentService.findById = async () => ({ ...student, study_hours_per_day: value });
    const res = await request();
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.code, 'INSUFFICIENT_STUDENT_DATA');
    assert.doesNotMatch(JSON.stringify(res.body), /NaN|Infinity|STU001|stack/);
  }
  assert.equal(calls.inference.length, 0);
  assert.equal(calls.save.length, 0);
});

test('typed ML dependency failures return safe 503 without persistence', async () => {
  inference = async () => { throw new MlDependencyError('private /model/path SQL password'); };
  const res = await request();
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'ML_SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(res.body), /private|password|SQL|\/model/);
  assert.equal(calls.save.length, 0);
});

test('malformed model output returns 503 rather than generating fake advice', async () => {
  for (const output of [null, [], { ...prediction, final_score: NaN }, { ...prediction, grade_probabilities: { C: Infinity } }]) {
    inference = async () => output;
    const res = await request();
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.interventionNote, undefined);
  }
  assert.equal(calls.save.length, 0);
});

test('unexpected lookup and persistence failures produce safe 500 responses', async () => {
  const fail = async () => { throw new Error('SQL secret SELECT * FROM private /local/path'); };
  studentService.findById = fail;
  assert.equal((await request()).statusCode, 500);
  studentService.findById = async () => student;
  studentService.updateStudent = fail;
  const res = await request();
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /SQL|secret|SELECT|private|local|stack/);
});

test('a short notes column does not turn valid generation into 500 or truncate the note', async () => {
  let attempts = 0;
  studentService.updateStudent = async (id, data) => {
    attempts++;
    assert.ok(data.notes.length > 66);
    throw Object.assign(new Error('Data too long'), { code: 'ER_DATA_TOO_LONG', errno: 1406 });
  };
  const res = await request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.interventionStored, false);
  assert.equal(res.body.persistenceCode, 'INTERVENTION_STORAGE_LIMIT');
  assert.match(res.body.interventionNote, /=== END OF NOTE ===$/);
  assert.equal(attempts, 1);
});

test('absent notes column reports not stored explicitly', async () => {
  studentService.updateStudent = async () => false;
  const res = await request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.interventionStored, false);
  assert.equal(res.body.persistenceCode, 'INTERVENTION_NOT_STORED');
});

test('studentService wrapper is free of circular import failures and performs one lookup/inference/save', async () => {
  pool.query = async (sql, values) => {
    assert.match(sql, /WHERE `id` = \?/);
    assert.deepEqual(values, [1]);
    return [[student]];
  };
  const result = await studentService.generateInterventionNote(1);
  assert.equal(result.interventionStored, true);
  assert.equal(calls.lookup.length, 0);
  assert.equal(calls.inference.length, 1);
  assert.equal(calls.save.length, 1);
});

test('lookup and note update bind values instead of interpolating them into SQL', async () => {
  const note = "Student's note'; DROP TABLE students; --";
  const queries = [];
  schema.getDisplayColumns = () => [{ name: 'notes', inferredType: 'text' }];
  pool.query = async (sql, values) => {
    queries.push({ sql, values });
    return sql.startsWith('SELECT') ? [[student]] : [{ affectedRows: 1 }];
  };
  await originals.findById(2);
  await originals.updateStudent(2, { notes: note });
  assert.match(queries[0].sql, /WHERE `id` = \?/);
  assert.deepEqual(queries[0].values, [2]);
  assert.match(queries[1].sql, /SET `notes` = \? WHERE `id` = \?/);
  assert.deepEqual(queries[1].values, [note, 2]);
  assert.doesNotMatch(queries[1].sql, /DROP TABLE/);
});

test('supplied predictions still require valid normalized student data', async () => {
  await assert.rejects(counsel.generateInterventionNote(1, null, prediction, { ...student, sleep_hours: Infinity }), { code: 'INSUFFICIENT_STUDENT_DATA' });
  assert.equal(calls.save.length, 0);
});

test('custom notes are bounded and missing optional identity is normalized', async () => {
  await assert.rejects(counsel.generateInterventionNote(1, 'x'.repeat(2001), prediction, student), RangeError);
  const result = await counsel.generateInterventionNote(1, null, prediction, { ...student, student_id: undefined, name: undefined });
  assert.equal(result.student_id, null);
  assert.doesNotMatch(JSON.stringify(result), /undefined|NaN|Infinity|Invalid Date/);
});

test('habit summary still resolves studentService after removal of cyclic imports', async () => {
  assert.match((await counsel.summarizeHabits(1)).summary, /STU001/);
});
