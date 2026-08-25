import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_VALUE,
  createGoalSchema,
  createWeeklyCheckinSchema,
  createTrendChartData,
  formatGoalDate,
  formatMetric,
  getProgressStatusPresentation,
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
  assert.equal(formatMetric(12.345, { digits: 1, suffix: '%' }), '12.3%');
  assert.equal(formatGoalDate('not-a-date'), EMPTY_VALUE);
  assert.notEqual(formatGoalDate('2027-05-01'), EMPTY_VALUE);
});

test('check-ins sort chronologically without mutating source data', () => {
  const checkIns = [
    { id: 3, week_start: 'invalid' },
    { id: 2, week_start: '2027-04-14' },
    { id: 1, week_start: '2027-04-07' },
  ];

  const sorted = sortCheckInsChronologically(checkIns);

  assert.deepEqual(sorted.map((checkIn) => checkIn.id), [1, 2, 3]);
  assert.deepEqual(checkIns.map((checkIn) => checkIn.id), [3, 2, 1]);
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
