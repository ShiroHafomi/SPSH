import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimulationInputs,
  buildStudentProfileForm,
  clampNumber,
  formatStudentMetric,
  normalizeGrade,
  normalizePercentage,
  normalizeProbabilityEntries,
  scoreDelta,
  scoreTone,
  toFiniteNumber,
} from './studentDashboard.js';

test('student dashboard numeric helpers reject non-finite values and clamp bounded metrics', () => {
  assert.equal(toFiniteNumber('12.5'), 12.5);
  assert.equal(toFiniteNumber(''), null);
  assert.equal(toFiniteNumber('   '), null);
  assert.equal(toFiniteNumber(true), null);
  assert.equal(toFiniteNumber({ valueOf: () => 4 }), null);
  assert.equal(toFiniteNumber(Infinity), null);
  assert.equal(clampNumber(120, 0, 100, 0), 100);
  assert.equal(normalizePercentage(-4), 0);
  assert.equal(normalizePercentage(null), null);
  assert.equal(normalizePercentage('not-a-percentage'), null);
  assert.equal(formatStudentMetric(Number.NaN), '—');
});

test('student dashboard normalizes grades and probability rows', () => {
  assert.equal(normalizeGrade(' b '), 'B');
  assert.equal(normalizeGrade('A+'), null);
  assert.deepEqual(normalizeProbabilityEntries({ A: 1.4, B: '0.42', Z: 1, C: Infinity }), [
    { grade: 'A', probability: 1 },
    { grade: 'B', probability: 0.42 },
  ]);
  assert.deepEqual(normalizeProbabilityEntries(null), []);
});

test('student dashboard derives bounded simulator defaults and accurate boolean form values', () => {
  assert.deepEqual(buildSimulationInputs({
    study_hours_per_day: 30,
    sleep_hours: -1,
    attendance_percent: '87.5',
  }), {
    study_hours_per_day: 24,
    sleep_hours: 0,
    attendance_percent: 87.5,
  });

  const form = buildStudentProfileForm({
    age: Number.POSITIVE_INFINITY,
    internet_access: 'No',
    extracurricular: 1,
    part_time_job: null,
  });
  assert.equal(form.age, '');
  assert.equal(form.internet_access, 'No');
  assert.equal(form.extracurricular, 'Yes');
  assert.equal(form.part_time_job, '');
});

test('student dashboard score helpers remain neutral when comparison data is invalid', () => {
  assert.equal(scoreTone(82), 'success');
  assert.equal(scoreTone(67), 'warning');
  assert.equal(scoreTone(20), 'danger');
  assert.equal(scoreTone('not-a-score'), 'neutral');
  assert.equal(scoreDelta(78, 70), 8);
  assert.equal(scoreDelta(undefined, 70), null);
});
