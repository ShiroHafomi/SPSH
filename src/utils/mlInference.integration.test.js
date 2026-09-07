'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const scriptPath = path.join(projectRoot, 'ml', 'inference.py');
const modelsDirectory = path.join(projectRoot, 'ml', 'models');
const pythonCommand = process.env.ML_PYTHON_CMD || 'py';
const requiredArtifacts = [
  'regressor.joblib',
  'classifier.joblib',
  'preprocessor.joblib',
  'metrics.json',
];

const profile = Object.freeze({
  gender: 'Female',
  age: 20,
  study_hours_per_day: 4,
  attendance_percent: 85,
  sleep_hours: 7,
  previous_gpa: 3.5,
  parental_education: 'Bachelor',
  internet_access: 1,
  extracurricular: 1,
  part_time_job: 0,
});

describe('real ML inference contract', () => {
  it('loads the persisted preprocessor and predicts from raw API features', (context) => {
    if (!requiredArtifacts.every((file) => existsSync(path.join(modelsDirectory, file)))) {
      context.skip('trained model artifacts are unavailable');
      return;
    }

    const runtime = spawnSync(
      pythonCommand,
      ['-c', 'import joblib, numpy, pandas, sklearn'],
      { cwd: projectRoot, encoding: 'utf8', timeout: 15000 }
    );
    if (runtime.error?.code === 'ENOENT') {
      context.skip('Python runtime is unavailable');
      return;
    }
    if (runtime.status !== 0 && /ModuleNotFoundError|No module named/.test(runtime.stderr)) {
      context.skip('Python ML dependencies are unavailable');
      return;
    }
    assert.equal(runtime.status, 0, runtime.stderr || runtime.stdout);

    const result = spawnSync(
      pythonCommand,
      [scriptPath, '--json', '-'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        input: JSON.stringify(profile),
        timeout: 30000,
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const prediction = JSON.parse(result.stdout.trim());
    assert.equal(Number.isFinite(prediction.final_score), true);
    assert.match(prediction.grade, /^[A-F]$/);
    assert.equal(Number.isFinite(prediction.grade_confidence), true);
    assert.equal(
      Object.values(prediction.grade_probabilities).every(Number.isFinite),
      true
    );
  });
});
