'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validatePredictionOutput } = require('./mlService');

describe('mlService prediction output validation', () => {
  it('rejects malformed probabilities as an ML dependency failure', () => {
    const { MlDependencyError } = require('../utils/mlErrors');
    for (const probabilities of [undefined, null, [], { Z: 1 }, { A: NaN }, { A: Infinity }, { A: -0.1, B: 1.1 }, { A: 0.2 }]) {
      assert.throws(() => validatePredictionOutput({
        final_score: 82, grade: 'B', grade_confidence: 0.8, grade_probabilities: probabilities,
      }), MlDependencyError);
    }
  });
  it('returns valid model output without changing values', () => {
    const output = {
      final_score: 82.75,
      grade: 'B',
      grade_confidence: 0.87,
      grade_probabilities: { A: 0.1, B: 0.87, C: 0.03 },
    };

    assert.deepEqual(validatePredictionOutput(output), output);
    assert.notEqual(validatePredictionOutput(output), output);
    assert.deepEqual(validatePredictionOutput({ ...output, raw_model_path: 'private' }), output);
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
