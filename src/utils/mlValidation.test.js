'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { studentToProfile, validatePredictionProfile } = require('./mlValidation');

const profile = {
  gender: 'Female', age: 19, study_hours_per_day: '3.5', attendance_percent: '90',
  sleep_hours: '7.5', previous_gpa: '3.2', parental_education: 'Bachelor',
  internet_access: 'Yes', extracurricular: 'No', part_time_job: '0',
};

test('canonical database fields adapt with the actual schema object and camelCase semantic tags', () => {
  const schema = { columns: [
    { name: 'daily_study', semantic: 'studyHours' },
    { name: 'attendance', semantic: 'attendance' },
  ] };
  const row = { ...profile, study_hours_per_day: undefined, daily_study: '4.5', attendance: '95' };
  const adapted = studentToProfile(row, schema);
  assert.equal(adapted.study_hours_per_day, '4.5');
  assert.equal(adapted.attendance_percent, '95');
  assert.equal(adapted.previous_gpa, '3.2');
  const normalized = validatePredictionProfile(adapted);
  assert.equal(normalized.study_hours_per_day, 4.5);
  assert.equal(normalized.part_time_job, 0);
  assert.deepEqual(studentToProfile(row, schema.columns), adapted);
});

test('missing values remain null until required-field validation rejects them', () => {
  const adapted = studentToProfile({}, { columns: [] });
  assert.ok(Object.values(adapted).every(value => value === null));
  assert.throws(() => validatePredictionProfile(adapted), RangeError);
});

for (const invalid of [NaN, Infinity, -Infinity, 'NaN', 'Infinity', '2 hours', ' ', true, [], {}, '0x10']) {
  test(`numeric model inputs reject corrupt value ${JSON.stringify(invalid)} (${typeof invalid})`, () => {
    assert.throws(() => validatePredictionProfile({ ...profile, study_hours_per_day: invalid }), RangeError);
  });
}

test('numeric model inputs enforce ranges without silently clamping', () => {
  for (const [field, value] of [
    ['age', 9], ['age', 19.5], ['study_hours_per_day', 25], ['attendance_percent', 101],
    ['sleep_hours', -1], ['previous_gpa', 4.1],
  ]) {
    assert.throws(() => validatePredictionProfile({ ...profile, [field]: value }), RangeError);
  }
  assert.equal(validatePredictionProfile({ ...profile, study_hours_per_day: '0' }).study_hours_per_day, 0);
});
