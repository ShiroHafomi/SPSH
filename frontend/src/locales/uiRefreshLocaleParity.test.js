import assert from 'node:assert/strict';
import test from 'node:test';

import en from './en.js';
import vi from './vi.js';

function leafPaths(value, prefix = '') {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return entry && typeof entry === 'object'
      ? leafPaths(entry, path)
      : [path];
  }).sort();
}

test('Vietnamese translations contain no Unicode replacement characters', () => {
  assert.equal(JSON.stringify(vi).includes('�'), false);
});

test('English and Vietnamese locales have matching keys', () => {
  assert.deepEqual(leafPaths(en), leafPaths(vi));
});

test('English and Vietnamese shell translations have matching keys', () => {
  assert.deepEqual(leafPaths(en.shell), leafPaths(vi.shell));
});

test('English and Vietnamese table translations have matching keys', () => {
  assert.deepEqual(leafPaths(en.table), leafPaths(vi.table));
});

test('shared UI refresh labels exist in both locales', () => {
  for (const key of ['dialog', 'viewDetails', 'failedToLoad', 'averageScore', 'count', 'value', 'versus', 'age']) {
    assert.equal(typeof en.common[key], 'string');
    assert.equal(typeof vi.common[key], 'string');
    assert.ok(en.common[key].trim());
    assert.ok(vi.common[key].trim());
  }
});

test('What-If simulator labels exist in both locales', () => {
  for (const key of [
    'simulatorSubtitle',
    'testField',
    'testValue',
    'analyzing',
    'simulationChange',
    'scoreDelta',
  ]) {
    assert.equal(typeof en.student[key], 'string');
    assert.equal(typeof vi.student[key], 'string');
    assert.ok(en.student[key].trim());
    assert.ok(vi.student[key].trim());
  }
});

test('admin AI tool guidance and lookup labels exist in both locales', () => {
  for (const key of [
    'studentIdLabel',
    'studentIdPlaceholder',
    'studentIdsLabel',
    'invalidStudentId',
    'invalidStudentIds',
    'dataHandling',
    'guidelineAuthorizedRecords',
    'guidelineApprovedSystems',
    'guidelineDecisionSupport',
    'guidelineReviewOutput',
    'guidelineVerifyStudent',
    'noSummaryGenerated',
    'noInterventionGenerated',
    'bulkEvalFailed',
  ]) {
    assert.equal(typeof en.admin[key], 'string');
    assert.equal(typeof vi.admin[key], 'string');
    assert.ok(en.admin[key].trim());
    assert.ok(vi.admin[key].trim());
  }
});
