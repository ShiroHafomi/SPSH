import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCreateUserPayload,
  createAdminUserSchema,
} from './adminUserValidation.js';

const t = (key) => key;
const schema = createAdminUserSchema(t);
const base = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  password: 'SecurePass1',
  role: 'student',
  studentId: '',
  department: '',
};

test('create-user schema normalizes valid role-specific values', () => {
  const student = schema.parse({ ...base, studentId: '42' });
  assert.equal(student.email, 'ada@example.com');
  assert.equal(student.studentId, 42);

  const teacher = schema.parse({
    ...base,
    role: 'teacher',
    department: '  Mathematics  ',
  });
  assert.equal(teacher.department, 'Mathematics');

  const admin = schema.parse({ ...base, role: 'admin' });
  assert.equal(admin.role, 'admin');
});

test('payload builder removes fields that do not apply to the selected role', () => {
  assert.deepEqual(buildCreateUserPayload({
    ...base,
    role: 'student',
    studentId: 7,
    department: 'Stale department',
  }), {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'SecurePass1',
    role: 'student',
    studentId: 7,
  });

  assert.deepEqual(buildCreateUserPayload({
    ...base,
    role: 'teacher',
    studentId: 7,
    department: '  Science  ',
  }), {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'SecurePass1',
    role: 'teacher',
    department: 'Science',
  });

  assert.deepEqual(buildCreateUserPayload({
    ...base,
    role: 'admin',
    studentId: 7,
    department: 'Science',
  }), {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'SecurePass1',
    role: 'admin',
  });
});

test('schema rejects invalid identity and role-specific values', () => {
  assert.equal(schema.safeParse({ ...base, name: 'A' }).success, false);
  assert.equal(schema.safeParse({ ...base, email: 'invalid' }).success, false);
  assert.equal(schema.safeParse({ ...base, role: 'owner' }).success, false);
  assert.equal(schema.safeParse({ ...base, studentId: '1.5' }).success, false);
  assert.equal(schema.safeParse({ ...base, studentId: '9007199254740992' }).success, false);
  assert.equal(schema.safeParse({ ...base, department: 'x'.repeat(101) }).success, false);
});

test('schema enforces password complexity and bcrypt UTF-8 byte limit', () => {
  assert.equal(schema.safeParse({ ...base, password: 'short1A' }).success, false);
  assert.equal(schema.safeParse({ ...base, password: 'lowercase1' }).success, false);
  assert.equal(schema.safeParse({ ...base, password: 'UPPERCASE1' }).success, false);
  assert.equal(schema.safeParse({ ...base, password: 'NoDigitsHere' }).success, false);

  const exactly72Bytes = `A${'a'.repeat(70)}1`;
  const over72Bytes = `A${'a'.repeat(71)}1`;
  assert.equal(new TextEncoder().encode(exactly72Bytes).length, 72);
  assert.equal(schema.safeParse({ ...base, password: exactly72Bytes }).success, true);
  assert.equal(schema.safeParse({ ...base, password: over72Bytes }).success, false);
});
