import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAndSortAtRiskStudents,
  paginateAtRiskStudents,
} from './adminAtRisk.js';

const STUDENTS = [
  { id: 1, student_id: 'STU-10', name: 'Lan', grade: 'B', risk_level: 'medium', risk_score: 20, notes: 'Needs a study plan' },
  { id: 2, student_id: 'STU-2', name: 'An', grade: 'D', risk_level: 'high', risk_score: 42, notes: null },
  { id: 3, student_id: 'STU-3', name: 'Minh', grade: null, risk_level: null, risk_score: null, notes: 'Attendance follow-up' },
];

test('filters at-risk students by search, grade, and risk level', () => {
  assert.deepEqual(
    filterAndSortAtRiskStudents(STUDENTS, { search: 'study plan' }).map(({ id }) => id),
    [1]
  );
  assert.deepEqual(
    filterAndSortAtRiskStudents(STUDENTS, { grade: 'd', riskLevel: 'HIGH' }).map(({ id }) => id),
    [2]
  );
});

test('sorts numeric and natural-text values while keeping missing values last', () => {
  assert.deepEqual(
    filterAndSortAtRiskStudents(STUDENTS, {}, 'risk_score', 'desc').map(({ id }) => id),
    [2, 1, 3]
  );
  assert.deepEqual(
    filterAndSortAtRiskStudents(STUDENTS, {}, 'student_id', 'asc').map(({ id }) => id),
    [2, 3, 1]
  );
});

test('ignores unsupported sort fields', () => {
  assert.deepEqual(
    filterAndSortAtRiskStudents(STUDENTS, {}, '__proto__', 'asc').map(({ id }) => id),
    [1, 2, 3]
  );
});

test('paginates normalized bounds without fabricating rows', () => {
  const middle = paginateAtRiskStudents([1, 2, 3, 4, 5], 2, 2);
  assert.deepEqual(middle, {
    students: [3, 4],
    page: 2,
    pageSize: 2,
    total: 5,
    totalPages: 3,
    start: 3,
    end: 4,
  });

  const empty = paginateAtRiskStudents([], 99, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.totalPages, 1);
  assert.equal(empty.start, 0);
  assert.equal(empty.end, 0);
  assert.deepEqual(empty.students, []);
});
