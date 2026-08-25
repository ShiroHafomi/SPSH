'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProgress, parseUtcDate } = require('./studyProgressService');

const NOW = new Date('2026-08-25T12:00:00.000Z');

function goal(overrides = {}) {
  return {
    status: 'active',
    deadline: '2026-09-30',
    target_score: 90,
    target_study_hours: 10,
    target_attendance: 95,
    ...overrides,
  };
}

function checkIn(overrides = {}) {
  return {
    week_start: '2026-08-03',
    study_hours: 10,
    sleep_hours: 8,
    attendance_percent: 95,
    current_score: 80,
    ...overrides,
  };
}

function assertNoNonFiniteValues(value) {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true, `Expected ${value} to be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoNonFiniteValues);
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(assertNoNonFiniteValues);
  }
}

test('calculateProgress returns insufficient_data with no check-ins', () => {
  const result = calculateProgress(goal(), [], { now: NOW });

  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.totalCheckIns, 0);
  assert.equal(result.latestCheckIn, null);
  assert.equal(result.progressPercentage, 0);
  assert.equal(result.remainingDays, 36);
});

test('calculateProgress keeps one check-in insufficient while reporting available averages', () => {
  const result = calculateProgress(goal(), [checkIn()], { now: NOW });

  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.totalCheckIns, 1);
  assert.equal(result.averageWeeklyStudyHours, 10);
  assert.equal(result.averageSleepHours, 8);
  assert.equal(result.averageAttendance, 95);
  assert.equal(result.firstRecordedScore, 80);
  assert.equal(result.latestRecordedScore, 80);
  assert.equal(result.scoreChange, null);
});

test('calculateProgress reports on_track only with multiple improving check-ins', () => {
  const checkIns = [
    checkIn({ current_score: 75 }),
    checkIn({ week_start: '2026-08-10', current_score: 82 }),
  ];
  const result = calculateProgress(goal(), checkIns, { now: NOW });

  assert.equal(result.status, 'on_track');
  assert.equal(result.firstRecordedScore, 75);
  assert.equal(result.latestRecordedScore, 82);
  assert.equal(result.scoreChange, 7);
  assert.equal(result.distanceFromTargetScore, 8);
  assert.equal(result.progressPercentage, 97.04);
});

test('calculateProgress handles missing optional values without non-finite output', () => {
  const checkIns = [
    checkIn({ study_hours: null, sleep_hours: null, attendance_percent: null, current_score: null }),
    checkIn({ week_start: '2026-08-10', study_hours: '', sleep_hours: undefined, attendance_percent: null, current_score: null }),
  ];
  const result = calculateProgress(goal(), checkIns, { now: NOW });

  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.averageWeeklyStudyHours, null);
  assert.equal(result.averageSleepHours, null);
  assert.equal(result.averageAttendance, null);
  assert.equal(result.latestRecordedScore, null);
  assert.equal(result.progressPercentage, 0);
  assertNoNonFiniteValues(result);
});

test('calculateProgress measures score improvement and decline deterministically', () => {
  const improving = calculateProgress(goal(), [
    checkIn({ current_score: 60 }),
    checkIn({ week_start: '2026-08-10', current_score: 75 }),
  ], { now: NOW });
  const declining = calculateProgress(goal(), [
    checkIn({ current_score: 85 }),
    checkIn({ week_start: '2026-08-10', current_score: 75 }),
  ], { now: NOW });

  assert.equal(improving.scoreChange, 15);
  assert.equal(declining.scoreChange, -10);
  assert.equal(declining.status, 'needs_attention');
});

test('calculateProgress clamps target attainment to 0 through 100', () => {
  const result = calculateProgress(goal({ target_score: 1, target_study_hours: 1, target_attendance: 1 }), [
    checkIn({ current_score: 1, study_hours: 500, attendance_percent: 300 }),
    checkIn({ week_start: '2026-08-10', current_score: 500, study_hours: 500, attendance_percent: 300 }),
  ], { now: NOW });

  assert.equal(result.progressPercentage, 100);
  assert.equal(result.status, 'on_track');
});

test('calculateProgress marks active goals past their UTC deadline overdue', () => {
  const result = calculateProgress(goal({ deadline: '2026-08-24' }), [], { now: NOW });

  assert.equal(result.remainingDays, -1);
  assert.equal(result.status, 'overdue');
});

test('calculateProgress gives completed status precedence over other rules', () => {
  const result = calculateProgress(goal({ status: 'completed', deadline: '2020-01-01' }), [], { now: NOW });

  assert.equal(result.status, 'completed');
});

test('calculateProgress never reports a paused or cancelled goal as on_track', () => {
  const checkIns = [
    checkIn({ current_score: 75 }),
    checkIn({ week_start: '2026-08-10', current_score: 82 }),
  ];

  assert.equal(calculateProgress(goal({ status: 'paused' }), checkIns, { now: NOW }).status, 'needs_attention');
  assert.equal(calculateProgress(goal({ status: 'cancelled' }), checkIns, { now: NOW }).status, 'needs_attention');
});

test('calculateProgress treats invalid and edge-case dates safely', () => {
  assert.equal(parseUtcDate('2026-02-29'), null);
  assert.equal(parseUtcDate('not-a-date'), null);
  assert.equal(parseUtcDate('2024-02-29'), Date.UTC(2024, 1, 29));

  const result = calculateProgress(goal({ deadline: '2026-02-29' }), [], { now: NOW });
  assert.equal(result.remainingDays, null);
  assert.equal(result.status, 'insufficient_data');
  assertNoNonFiniteValues(result);
});
