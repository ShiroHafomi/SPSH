'use strict';

/**
 * Unified ML Service
 * Single entry point for all prediction paths.
 * Uses strict validation + bounded runner.
 */

const { validatePredictionProfile, studentToProfile } = require('../utils/mlValidation');
const { runInference, getRunnerStats } = require('../utils/mlRunner');
const studentService = require('./studentService');
const { getSchemaMap } = require('../utils/schemaMap');

/**
 * Internal: run a single validated prediction.
 */
async function predict(input) {
  const validated = validatePredictionProfile(input);
  return runInference(validated);
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
async function predictForStudent(studentId) {
  const student = await studentService.findById(studentId);
  if (!student) throw new Error('Student not found');

  const schemaMap = getSchemaMap();
  const profile = studentToProfile(student, schemaMap);
  return predict(profile);
}

/**
 * What-if simulation: current + modified.
 * Returns { current, simulated } where each is the raw ML result.
 */
async function simulate(studentId, modifications) {
  const student = await studentService.findById(studentId);
  if (!student) throw new Error('Student not found');

  const schemaMap = getSchemaMap();
  const baseProfile = studentToProfile(student, schemaMap);

  // Current prediction
  const current = await predict(baseProfile);

  // Simulated prediction with modifications
  const simulatedProfile = { ...baseProfile, ...modifications };
  const simulated = await predict(simulatedProfile);

  return { current, simulated };
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
};