'use strict';

/**
 * Unified ML Service
 * Single entry point for all prediction paths.
 * Uses strict validation + bounded runner.
 */

const { validatePredictionProfile, studentToProfile } = require('../utils/mlValidation');
const { MlDependencyError, StudentPredictionDataError } = require('../utils/mlErrors');
const { runInference, getRunnerStats } = require('../utils/mlRunner');
const { getSchemaMap } = require('../utils/schemaMap');

const SUPPORTED_GRADES = new Set(['A', 'B', 'C', 'D', 'F']);

/**
 * Internal: run a single validated prediction.
 */
async function predict(input) {
  const validated = validatePredictionProfile(input);
  const result = await runInference(validated);
  return validatePredictionOutput(result);
}

/**
 * Reject corrupt model output instead of coercing or silently clamping it.
 */
function invalidPredictionOutput() {
  return new MlDependencyError('Invalid prediction output');
}

function validatePredictionOutput(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw invalidPredictionOutput();
  }
  if (!Number.isFinite(result.final_score) || result.final_score < 0 || result.final_score > 100) {
    throw invalidPredictionOutput();
  }
  if (!SUPPORTED_GRADES.has(result.grade)) {
    throw invalidPredictionOutput();
  }
  if (!Number.isFinite(result.grade_confidence) || result.grade_confidence < 0 || result.grade_confidence > 1) {
    throw invalidPredictionOutput();
  }

  const probabilities = result.grade_probabilities;
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) {
    throw invalidPredictionOutput();
  }

  const normalizedProbabilities = {};
  let probabilityTotal = 0;
  for (const [grade, probability] of Object.entries(probabilities)) {
    if (!SUPPORTED_GRADES.has(grade)
        || !Number.isFinite(probability)
        || probability < 0
        || probability > 1) {
      throw invalidPredictionOutput();
    }
    normalizedProbabilities[grade] = probability;
    probabilityTotal += probability;
  }
  if (Object.keys(normalizedProbabilities).length > 0
      && Math.abs(probabilityTotal - 1) > 0.001) {
    throw invalidPredictionOutput();
  }

  return {
    final_score: result.final_score,
    grade: result.grade,
    grade_confidence: result.grade_confidence,
    grade_probabilities: normalizedProbabilities,
  };
}

/**
 * Prediction from raw API input (used by /predict, /feedback).
 */
async function predictFromInput(rawInput) {
  return predict(rawInput);
}

/**
 * Prediction for a student by ID (used by simulator, advisor, counsel, intervention).
 * Fetches student, adapts via schema map, runs prediction.
 */
async function predictForStudent(studentId, studentRecord) {
  const studentService = require('./studentService');
  const student = studentRecord ?? await studentService.findById(studentId);
  if (!student) throw new Error('Student not found');

  let profile;
  try {
    profile = validatePredictionProfile(studentToProfile(student, getSchemaMap()));
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new StudentPredictionDataError({ cause: error });
    }
    throw error;
  }
  return predict(profile);
}

/**
 * What-if simulation: current + modified.
 * Returns { current, simulated } where each is the raw ML result.
 */
async function simulate(studentId, modifications) {
  const studentService = require('./studentService');
  const student = await studentService.findById(studentId);
  if (!student) throw new Error('Student not found');

  const schemaMap = getSchemaMap();
  const baseProfile = validatePredictionProfile(studentToProfile(student, schemaMap));
  const startedCurrentAt = process.hrtime.bigint();
  const current = await predict(baseProfile);
  const currentLatencyMs = Number(
    (process.hrtime.bigint() - startedCurrentAt) / 1000000n
  );

  if (Object.keys(modifications).length === 0) {
    return {
      current,
      simulated: current,
      historyEntries: [{
        input: baseProfile,
        result: current,
        inferenceLatencyMs: currentLatencyMs,
      }],
    };
  }

  const simulatedProfile = validatePredictionProfile({ ...baseProfile, ...modifications });
  const startedSimulatedAt = process.hrtime.bigint();
  const simulated = await predict(simulatedProfile);
  const simulatedLatencyMs = Number(
    (process.hrtime.bigint() - startedSimulatedAt) / 1000000n
  );

  return {
    current,
    simulated,
    historyEntries: [
      {
        input: baseProfile,
        result: current,
        inferenceLatencyMs: currentLatencyMs,
      },
      {
        input: simulatedProfile,
        result: simulated,
        inferenceLatencyMs: simulatedLatencyMs,
      },
    ],
  };
}

/**
 * Batch prediction for multiple students (max 50).
 */
async function batchPredict(studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return [];
  }
  if (studentIds.length > 50) {
    throw new RangeError('Batch size cannot exceed 50');
  }

  // Sequential to respect runner concurrency cap
  const results = [];
  for (const id of studentIds) {
    try {
      const prediction = await predictForStudent(id);
      results.push({ studentId: id, prediction });
    } catch (err) {
      results.push({ studentId: id, error: 'Prediction failed' });
    }
  }
  return results;
}

/**
 * Get runner stats for admin health endpoint.
 */
function getStats() {
  return getRunnerStats();
}

module.exports = {
  predict,
  predictFromInput,
  predictForStudent,
  simulate,
  batchPredict,
  getStats,
  validatePredictionOutput,
};