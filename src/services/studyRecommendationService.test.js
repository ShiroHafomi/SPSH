'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecommendations, mondayWindow } = require('./studyRecommendationService');

const base = {
  student: { study_hours_per_day: 4, attendance_percent: 95, sleep_hours: 8 },
  prediction: { final_score: 91, grade: 'A' },
  assignments: { summary: { todo: 0, inProgress: 0, done: 4, overdue: 0 } },
  goals: [{ goal: { status: 'active' }, progress: { progressPercentage: 82, status: 'on_track' } }],
  sessionSummary: { total_sessions: 5, completed_sessions: 5, skipped_sessions: 0 },
  history: [{ predictedScore: 91 }, { predictedScore: 89 }],
};

test('buildRecommendations returns deterministic healthy recommendations and Excellent status', () => {
  const result = buildRecommendations(base);
  assert.equal(result.overallStatus, 'Excellent');
  assert.ok(result.recommendations.length >= 3 && result.recommendations.length <= 5);
  assert.deepEqual(result.recommendations.map((item) => item.priority), ['low', 'low', 'low']);
  assert.ok(result.recommendations.every((item) => item.title && item.explanation && item.nextStep));
});

test('buildRecommendations prioritizes multiple urgent signals and caps output', () => {
  const result = buildRecommendations({
    student: { study_hours_per_day: 1, attendance_percent: 50, sleep_hours: 4 },
    prediction: { final_score: 45, grade: 'F' },
    assignments: { summary: { todo: 3, inProgress: 1, done: 0, overdue: 4 } },
    sessionSummary: { total_sessions: 5, completed_sessions: 1, skipped_sessions: 4 },
  });
  assert.equal(result.overallStatus, 'At Risk');
  assert.equal(result.recommendations.length, 5);
  assert.ok(result.recommendations.filter((item) => item.priority === 'high').length >= 2);
});

test('buildRecommendations handles absent data without invalid numbers or private text', () => {
  const result = buildRecommendations({});
  assert.equal(result.overallStatus, 'Needs Attention');
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.dataAvailability.prediction, false);
  assert.equal(JSON.stringify(result).includes('student_note'), false);
  assert.equal(JSON.stringify(result).includes('NaN'), false);
  assert.equal(JSON.stringify(result).includes('Infinity'), false);
});

test('buildRecommendations reports a medium concern for a downward prediction trend', () => {
  const result = buildRecommendations({
    prediction: { final_score: 75, grade: 'B' },
    history: [{ predictedScore: 70 }, { predictedScore: 80 }],
  });
  assert.equal(result.overallStatus, 'On Track');
  assert.equal(result.recommendations[0].priority, 'medium');
});

test('mondayWindow creates a bounded UTC week', () => {
  const { startDate, endDate } = mondayWindow(new Date('2026-09-16T12:00:00.000Z'));
  assert.equal(startDate, '2026-09-14T00:00:00.000Z');
  assert.equal(endDate, '2026-09-21T00:00:00.000Z');
});
