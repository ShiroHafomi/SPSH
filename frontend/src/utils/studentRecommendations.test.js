import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStudentRecommendationsViewState,
  normalizeStudentRecommendations,
} from './studentRecommendations.js';

test('normalizeStudentRecommendations keeps safe recommendation fields and caps five cards', () => {
  const response = {
    overallStatus: 'At Risk',
    summary: { predictedScore: '81.5', predictedGrade: 'B', sleepHours: Infinity },
    recommendations: [
      { id: 'a', title: 'A', explanation: 'Explain', priority: 'high', nextStep: 'Do' },
      { id: 'bad', title: '', explanation: 'Explain', priority: 'high', nextStep: 'Do' },
      ...Array.from({ length: 6 }, (_, index) => ({ id: `r${index}`, title: `R${index}`, explanation: 'Explain', priority: 'low', nextStep: 'Do' })),
    ],
  };
  const normalized = normalizeStudentRecommendations(response);
  assert.equal(normalized.overallStatus, 'At Risk');
  assert.equal(normalized.recommendations.length, 5);
  assert.equal(normalized.summary.predictedScore, '81.5');
  assert.equal(normalized.summary.sleepHours, null);
});

test('normalizeStudentRecommendations handles malformed responses as an empty safe state', () => {
  const normalized = normalizeStudentRecommendations(null);
  assert.deepEqual(normalized.recommendations, []);
  assert.equal(normalized.overallStatus, null);
  assert.equal(getStudentRecommendationsViewState({ loading: false, error: null, data: normalized }), 'empty');
});

test('recommendation view state covers loading and errors', () => {
  assert.equal(getStudentRecommendationsViewState({ loading: true, error: null, data: null }), 'loading');
  assert.equal(getStudentRecommendationsViewState({ loading: false, error: new Error('x'), data: null }), 'error');
  assert.equal(getStudentRecommendationsViewState({ loading: false, error: null, data: { recommendations: [{ title: 'x' }] } }), 'ready');
});
