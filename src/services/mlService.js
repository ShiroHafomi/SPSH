/**
 * ML Service — Wrapper for Python inference.py
 * Handles prediction, what-if simulation, and batch evaluation.
 */
const { execFile } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'ml', 'inference.py');

/**
 * Run prediction for a student profile.
 */
function runPrediction(input) {
  return new Promise((resolve, reject) => {
    // Ensure binary features are 0/1
    const pythonInput = { ...input };
    for (const key of ['internet_access', 'extracurricular', 'part_time_job']) {
      if (typeof pythonInput[key] === 'string') {
        pythonInput[key] = pythonInput[key].toLowerCase() === 'yes' ? 1 : 0;
      } else if (typeof pythonInput[key] === 'boolean') {
        pythonInput[key] = pythonInput[key] ? 1 : 0;
      }
    }

    const proc = execFile('py', [SCRIPT_PATH, '--json', '-'], {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[runPrediction] Python error:', stderr);
        return reject(new Error(`Prediction failed: ${stderr}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (parseErr) {
        console.error('[runPrediction] Parse error:', parseErr);
        reject(new Error('Failed to parse prediction result'));
      }
    });

    proc.on('error', (error) => reject(error));
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    proc.stdin.write(JSON.stringify(pythonInput));
    proc.stdin.end();
  });
}

/**
 * What-If simulation: run prediction with modified habit values.
 * Returns both current and simulated predictions.
 */
async function runWhatIfSimulation(student, modifications = {}) {
  // Build current prediction input
  const currentInput = {
    gender: student.gender,
    age: student.age,
    study_hours_per_day: student.study_hours_per_day,
    attendance_percent: student.attendance_percent,
    sleep_hours: student.sleep_hours,
    previous_gpa: student.previous_gpa,
    parental_education: student.parental_education,
    internet_access: student.internet_access ? 1 : 0,
    extracurricular: student.extracurricular ? 1 : 0,
    part_time_job: student.part_time_job ? 1 : 0,
  };

  // Build simulated input with modifications
  const simulatedInput = { ...currentInput, ...modifications };

  // Run both predictions in parallel
  const [current, simulated] = await Promise.all([
    runPrediction(currentInput),
    runPrediction(simulatedInput),
  ]);

  return { current, simulated };
}

/**
 * Batch prediction for multiple students (max 50 for performance).
 */
async function runBatchPrediction(students) {
  const results = [];
  for (const student of students) {
    try {
      const prediction = await runPrediction({
        gender: student.gender,
        age: student.age,
        study_hours_per_day: student.study_hours_per_day,
        attendance_percent: student.attendance_percent,
        sleep_hours: student.sleep_hours,
        previous_gpa: student.previous_gpa,
        parental_education: student.parental_education,
        internet_access: student.internet_access ? 1 : 0,
        extracurricular: student.extracurricular ? 1 : 0,
        part_time_job: student.part_time_job ? 1 : 0,
      });
      results.push({ studentId: student.id, student_id: student.student_id, prediction });
    } catch (err) {
      results.push({ studentId: student.id, student_id: student.student_id, error: err.message });
    }
  }
  return results;
}

module.exports = {
  runPrediction,
  runWhatIfSimulation,
  runBatchPrediction,
};