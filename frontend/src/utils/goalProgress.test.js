import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_VALUE,
  asFiniteNumber,
  asPositiveSafeInteger,
  createGoalSchema,
  createWeeklyCheckinSchema,
  createTrendChartData,
  formatGoalDate,
  formatMetric,
  getProgressStatusPresentation,
  normalizeGoalEntries,
  normalizeGoalPagination,
  sortCheckInsChronologically,
} from './goalProgress.js';

const t = (key) => key;

const validGoal = {
  target_score: '90',
  target_grade: 'A',
  target_study_hours: '10',
  target_attendance: '95',
  deadline: '2027-05-01',
  status: 'active',
};

const validCheckIn = {
  week_start: '2027-04-07',
  study_hours: '10',
  sleep_hours: '8',
  attendance_percent: '95',
  current_score: '80',
  student_note: 'Finished the practice set.',
};

test('goal schema accepts backend-compatible goal limits and coerces numbers', () => {
  const result = createGoalSchema(t).safeParse(validGoal);

  assert.equal(result.success, true);
  assert.equal(result.data.target_score, 90);
  assert.equal(result.data.target_study_hours, 10);
});

test('goal schema rejects invalid targets and invalid calendar dates', () => {
  const invalidTarget = createGoalSchema(t).safeParse({ ...validGoal, target_score: '101' });
  const invalidDate = createGoalSchema(t).safeParse({ ...validGoal, deadline: '2027-02-29' });

  assert.equal(invalidTarget.success, false);
  assert.equal(invalidDate.success, false);
});

test('weekly check-in schema requires measured fields and enforces backend limits', () => {
  const valid = createWeeklyCheckinSchema(t).safeParse(validCheckIn);
  const missing = createWeeklyCheckinSchema(t).safeParse({ ...validCheckIn, study_hours: '' });
  const tooLong = createWeeklyCheckinSchema(t).safeParse({ ...validCheckIn, student_note: 'x'.repeat(1001) });

  assert.equal(valid.success, true);
  assert.equal(valid.data.sleep_hours, 8);
  assert.equal(missing.success, false);
  assert.equal(tooLong.success, false);
});

test('formatters never expose non-finite values or invalid dates', () => {
  assert.equal(formatMetric(null), EMPTY_VALUE);
  assert.equal(formatMetric(Number.NaN), EMPTY_VALUE);
  assert.equal(formatMetric(Infinity), EMPTY_VALUE);
  assert.equal(asFiniteNumber(true), null);
  assert.equal(asFiniteNumber({ valueOf: () => 4 }), null);
  assert.equal(formatMetric(12.345, { digits: 1, suffix: '%' }), '12.3%');
  assert.equal(formatMetric(12.5, { language: 'vi' }), '12,5');
  assert.equal(formatGoalDate('not-a-date'), EMPTY_VALUE);
  assert.notEqual(formatGoalDate('2027-05-01'), EMPTY_VALUE);
});

test('check-ins sort chronologically without mutating source data', () => {
  const checkIns = [
    null,
    { id: 3, week_start: 'invalid' },
    { id: 2, week_start: '2027-04-14' },
    { id: 1, week_start: '2027-04-07' },
  ];

  const sorted = sortCheckInsChronologically(checkIns);

  assert.deepEqual(sorted.map((checkIn) => checkIn.id), [1, 2, 3]);
  assert.deepEqual(checkIns.map((checkIn) => checkIn?.id), [undefined, 3, 2, 1]);
});

test('trend-data transformation excludes missing values and requires two points', () => {
  const color = { border: '#111', bg: '#222', solid: '#333' };
  const noChart = createTrendChartData([
    { week_start: '2027-04-07', current_score: null },
    { week_start: '2027-04-14', current_score: 80 },
  ], 'current_score', 'Score', color);
  const chart = createTrendChartData([
    { week_start: '2027-04-14', current_score: 85 },
    { week_start: '2027-04-07', current_score: 80 },
    { week_start: '2027-04-21', current_score: Infinity },
  ], 'current_score', 'Score', color);

  assert.equal(noChart, null);
  assert.deepEqual(chart.datasets[0].data, [80, 85]);
  assert.equal(chart.datasets[0].data.every(Number.isFinite), true);
});

test('every server progress status has a presentational mapping', () => {
  ['on_track', 'needs_attention', 'insufficient_data', 'completed', 'overdue'].forEach((status) => {
    const presentation = getProgressStatusPresentation(status);
    assert.equal(typeof presentation.labelKey, 'string');
    assert.equal(typeof presentation.icon, 'string');
  });
});

test('goal route IDs accept only positive safe integers', () => {
  assert.equal(asPositiveSafeInteger(12), 12);
  assert.equal(asPositiveSafeInteger('12'), 12);
  assert.equal(asPositiveSafeInteger(''), null);
  assert.equal(asPositiveSafeInteger('../12'), null);
  assert.equal(asPositiveSafeInteger('1e2'), null);
  assert.equal(asPositiveSafeInteger('0x10'), null);
  assert.equal(asPositiveSafeInteger(true), null);
  assert.equal(asPositiveSafeInteger(1.5), null);
  assert.equal(asPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1), null);
});

test('goal entries discard malformed records and sanitize actionable IDs and text', () => {
  assert.deepEqual(normalizeGoalEntries([
    null,
    { goal: null },
    { goal: { id: '../2' } },
    {
      goal: { id: '2', status: 'active', target_grade: 'A' },
      progress: null,
      checkIns: [
        null,
        { id: '3', student_note: { unsafe: true }, teacher_feedback: 'Keep going' },
      ],
    },
  ]), [{
    goal: { id: 2, status: 'active', target_grade: 'A' },
    progress: {},
    checkIns: [{ id: 3, student_note: '', teacher_feedback: 'Keep going' }],
  }]);
});

test('goal pagination is finite, bounded, and derived from the authoritative total', () => {
  assert.deepEqual(normalizeGoalPagination({
    page: 4,
    size: 20,
    total: 41,
    totalPages: Infinity,
  }, 4), {
    page: 3,
    size: 20,
    total: 41,
    totalPages: 3,
  });

  assert.deepEqual(normalizeGoalPagination(null, Number.NaN, Infinity), {
    page: 1,
    size: 20,
    total: 0,
    totalPages: 1,
  });
});
