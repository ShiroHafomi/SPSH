'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validatePredictionOutput } = require('./mlService');

describe('mlService prediction output validation', () => {
  it('returns valid model output without changing values', () => {
    const output = {
      final_score: 82.75,
      grade: 'B',
      grade_confidence: 0.87,
      grade_probabilities: { A: 0.1, B: 0.87, C: 0.03 },
    };

    assert.equal(validatePredictionOutput(output), output);
  });

  it('rejects malformed and non-finite model output', () => {
    assert.throws(() => validatePredictionOutput(null), /Invalid prediction output/);
    assert.throws(
      () => validatePredictionOutput({ final_score: Number.NaN, grade: 'B', grade_confidence: 0.8 }),
      /Invalid prediction output/
    );
    assert.throws(
      () => validatePredictionOutput({ final_score: 101, grade: 'B', grade_confidence: 0.8 }),
      /Invalid prediction output/
    );
    assert.throws(
      () => validatePredictionOutput({ final_score: 80, grade: 'E', grade_confidence: 0.8 }),
      /Invalid prediction output/
    );
    assert.throws(
      () => validatePredictionOutput({ final_score: 80, grade: 'B', grade_confidence: Infinity }),
      /Invalid prediction output/
    );
  });
});
