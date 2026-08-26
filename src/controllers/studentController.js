/**
 * Student Controller — Personal profile, risk alerts, what-if simulator, AI advisor.
 * All endpoints require the student role and resolve the linked record from req.user.
 */
const studentService = require('../services/studentService');
const mlService = require('../services/mlService');
const predictionHistoryService = require('../services/predictionHistoryService');
const { generateStudentAdvice } = require('../services/aiCounselService');
const { logAuditEvent } = require('../services/authService');

/**
 * GET /api/student/me/profile
 * Get own profile with class percentile and risk alerts.
 */
async function apiStudentProfile(req, res) {
  try {
    // Student can only see their own profile
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const student = await studentService.findById(studentId);

    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    // Get class percentile rankings
    const percentiles = await studentService.getStudentPercentiles(student.id);

    // Check personal risk thresholds
    const riskAlerts = await studentService.checkPersonalRiskAlerts(student);

    res.json({
      student,
      percentiles,
      riskAlerts,
    });
  } catch (err) {
    console.error('[apiStudentProfile]', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
}

/**
 * POST /api/student/me/simulate
 * What-If habit simulator - real-time AI prediction with modified habits.
 */
async function apiStudentSimulate(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const student = await studentService.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    // Input: modified habits
    const { study_hours_per_day, sleep_hours, attendance_percent } = req.body || {};

    // Validate input
    const errors = [];
    if (study_hours_per_day !== undefined) {
      const val = parseFloat(study_hours_per_day);
      if (isNaN(val) || val < 0 || val > 24) {
        errors.push('study_hours_per_day must be between 0 and 24.');
      }
    }
    if (sleep_hours !== undefined) {
      const val = parseFloat(sleep_hours);
      if (isNaN(val) || val < 0 || val > 24) {
        errors.push('sleep_hours must be between 0 and 24.');
      }
    }
    if (attendance_percent !== undefined) {
      const val = parseInt(attendance_percent, 10);
      if (isNaN(val) || val < 0 || val > 100) {
        errors.push('attendance_percent must be between 0 and 100.');
      }
    }

    if (errors.length) {
      return res.status(400).json({ error: errors[0], errors });
    }

    // Build modifications for simulation
    const modifications = {};
    if (study_hours_per_day !== undefined) modifications.study_hours_per_day = parseFloat(study_hours_per_day);
    if (sleep_hours !== undefined) modifications.sleep_hours = parseFloat(sleep_hours);
    if (attendance_percent !== undefined) modifications.attendance_percent = parseInt(attendance_percent, 10);

    // Run simulation (current + modified in one call)
    let simulation;
    try {
      simulation = await mlService.simulate(studentId, modifications);
    } catch (err) {
      if (err.message === 'ML capacity exceeded') {
        return res.status(503).json({ error: 'Simulation service temporarily unavailable, please retry' });
      }
      if (err.message && err.message.includes('Student not found')) {
        return res.status(404).json({ error: 'Student record not found.' });
      }
      throw err;
    }

    // Record each inference using route-controlled kinds and trusted identities.
    const historyEntries = Array.isArray(simulation.historyEntries)
      ? simulation.historyEntries
      : [];
    for (const [index, entry] of historyEntries.entries()) {
      try {
        await predictionHistoryService.recordPredictionEvent(
          entry.input,
          entry.result,
          {
            predictionKind: index === 0 ? 'baseline' : 'simulation',
            actorUserId: req.user.id,
            studentId,
            inferenceLatencyMs: entry.inferenceLatencyMs,
          }
        );
      } catch (historyErr) {
        console.error(
          '[apiStudentSimulate] Failed to record prediction history:',
          historyErr.message
        );
      }
    }

    // Generate recommendations based on the difference
    const recommendations = generateRecommendations(student, simulation.current, simulation.simulated);

    res.json({
      current: simulation.current,
      simulated: simulation.simulated,
      recommendations,
      inputs: modifications,
    });
  } catch (err) {
    console.error('[apiStudentSimulate]', err);
    res.status(500).json({ error: 'Simulation failed.' });
  }
}

/**
 * GET /api/student/me/advisor
 * AI Academic Advisor - natural language recommendations.
 */
async function apiStudentAdvisor(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const student = await studentService.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    // Get current prediction
    let current;
    try {
      current = await mlService.predictForStudent(studentId);
    } catch (err) {
      if (err.message === 'ML capacity exceeded') {
        return res.status(503).json({ error: 'Advisor service temporarily unavailable, please retry' });
      }
      throw err;
    }

    // Generate personalized advice using current prediction
    const advice = await generateStudentAdvice(student, current);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'VIEW_ADVISOR',
      resourceType: 'student',
      resourceId: student.id,
      metadata: { studentId: student.student_id },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({
      studentId: student.student_id,
      name: student.name,
      currentGrade: current.grade,
      currentScore: current.final_score,
      advice,
    });
  } catch (err) {
    console.error('[apiStudentAdvisor]', err);
    res.status(500).json({ error: 'Failed to generate advisor recommendations.' });
  }
}

/**
 * Generate recommendations based on current vs simulated predictions.
 */
function generateRecommendations(student, current, simulated) {
  const recommendations = [];

  const scoreDiff = simulated.final_score - current.final_score;
  const gradeImproved = gradeToNumber(simulated.grade) < gradeToNumber(current.grade);

  if (scoreDiff > 5 || gradeImproved) {
    recommendations.push({
      type: 'positive',
      icon: 'TrendingUp',
      title: 'Significant improvement predicted',
      message: `Your changes could increase your final score by ${Math.round(scoreDiff)} points and improve your grade to ${simulated.grade}.`,
    });
  } else if (scoreDiff > 0) {
    recommendations.push({
      type: 'positive',
      icon: 'TrendingUp',
      title: 'Moderate improvement predicted',
      message: `Your changes could increase your final score by ${Math.round(scoreDiff)} points.`,
    });
  }

  // Specific habit recommendations
  if (student.study_hours_per_day < 3) {
    recommendations.push({
      type: 'warning',
      icon: 'BookOpen',
      title: 'Increase study hours',
      message: 'Students studying 3+ hours/day typically score 15-20 points higher.',
    });
  }

  if (student.sleep_hours < 7) {
    recommendations.push({
      type: 'warning',
      icon: 'Moon',
      title: 'Improve sleep schedule',
      message: 'Getting 7-9 hours of sleep is linked to better memory consolidation and test performance.',
    });
  }

  if (student.attendance_percent < 80) {
    recommendations.push({
      type: 'danger',
      icon: 'AlertTriangle',
      title: 'Attendance below safe threshold',
      message: `At ${student.attendance_percent}% attendance, you risk exam restrictions. Aim for 85%+.`,
    });
  }

  if (student.part_time_job && student.study_hours_per_day < 4) {
    recommendations.push({
      type: 'info',
      icon: 'Briefcase',
      title: 'Balance work and study',
      message: 'With a part-time job, try to dedicate at least 3-4 focused hours to study daily.',
    });
  }

  return recommendations;
}

/**
 * Convert grade letter to number for comparison (A=1, B=2, etc.)
 */
function gradeToNumber(grade) {
  const map = { A: 1, B: 2, C: 3, D: 4, F: 5 };
  return map[grade] || 99;
}

/**
 * PUT /api/student/me/profile
 * Update own profile (editable fields only).
 */
async function apiStudentUpdateProfile(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const student = await studentService.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const body = req.body || {};
    const { getDisplayColumns } = require('../utils/schemaMap');
    const displayCols = getDisplayColumns();

    // Define editable fields for students (exclude calculated/system fields)
    const editableFields = new Set([
      'gender',
      'age',
      'study_hours_per_day',
      'attendance_percent',
      'sleep_hours',
      'previous_gpa',
      'parental_education',
      'internet_access',
      'extracurricular',
      'part_time_job',
      'notes',
    ]);

    // Also check against schema to ensure field exists and is valid
    const validEditableFields = new Set(
      displayCols.filter(c => editableFields.has(c.name)).map(c => c.name)
    );

    // Filter and validate input
    const updateData = {};
    const errors = [];

    for (const [key, value] of Object.entries(body)) {
      if (!validEditableFields.has(key)) {
        continue; // silently ignore non-editable fields
      }

      const col = displayCols.find(c => c.name === key);
      if (!col) continue;

      // Validation based on inferred type
      if (value === '' || value === null || value === undefined) {
        updateData[key] = null; // allow clearing
        continue;
      }

      switch (col.inferredType) {
        case 'int':
        case 'bigint': {
          const n = parseInt(value, 10);
          if (isNaN(n)) {
            errors.push(`${col.displayLabel || key} must be a valid integer.`);
          } else {
            // Additional range checks for specific fields
            if (key === 'attendance_percent' && (n < 0 || n > 100)) {
              errors.push(`${col.displayLabel || key} must be between 0 and 100.`);
            } else if (key === 'age' && (n < 15 || n > 30)) {
              errors.push(`${col.displayLabel || key} must be between 15 and 30.`);
            } else {
              updateData[key] = n;
            }
          }
          break;
        }
        case 'decimal': {
          const n = parseFloat(value);
          if (isNaN(n)) {
            errors.push(`${col.displayLabel || key} must be a valid number.`);
          } else {
            if (key === 'study_hours_per_day' && (n < 0 || n > 24)) {
              errors.push(`${col.displayLabel || key} must be between 0 and 24.`);
            } else if (key === 'sleep_hours' && (n < 0 || n > 24)) {
              errors.push(`${col.displayLabel || key} must be between 0 and 24.`);
            } else if (key === 'previous_gpa' && (n < 0 || n > 4.0)) {
              errors.push(`${col.displayLabel || key} must be between 0.0 and 4.0.`);
            } else {
              updateData[key] = n;
            }
          }
          break;
        }
        case 'boolean': {
          const s = String(value).toLowerCase();
          if (['1', 'true', 'on', 'yes', 'y'].includes(s)) {
            updateData[key] = 1;
          } else if (['0', 'false', 'off', 'no', 'n'].includes(s)) {
            updateData[key] = 0;
          } else {
            errors.push(`${col.displayLabel || key} must be a valid boolean (Yes/No).`);
          }
          break;
        }
        case 'category': {
          const str = String(value).trim();
          if (!str) {
            errors.push(`${col.displayLabel || key} cannot be empty.`);
          } else {
            // Validate against known categories for specific fields
            if (key === 'gender' && !['Male', 'Female'].includes(str)) {
              errors.push(`${col.displayLabel || key} must be either 'Male' or 'Female'.`);
            } else if (key === 'parental_education' && !['High School', 'Bachelor', 'Master', 'PhD'].includes(str)) {
              errors.push(`${col.displayLabel || key} has an invalid value.`);
            } else {
              updateData[key] = str;
            }
          }
          break;
        }
        case 'text': {
          const str = String(value).trim();
          if (str.length > 500) {
            errors.push(`${col.displayLabel || key} cannot exceed 500 characters.`);
          } else {
            updateData[key] = str;
          }
          break;
        }
        default: {
          const str = String(value).trim();
          updateData[key] = str;
        }
      }
    }

    if (errors.length) {
      return res.status(400).json({ error: errors[0], errors });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    // Update student record
    const success = await studentService.updateStudent(studentId, updateData);
    if (!success) {
      return res.status(404).json({ error: 'Student record not found or no changes made.' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_PROFILE',
      resourceType: 'student',
      resourceId: student.id,
      metadata: {
        studentId: student.student_id,
        updatedFields: Object.keys(updateData),
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    // Return updated student
    const updatedStudent = await studentService.findById(studentId);
    res.json({
      student: updatedStudent,
      message: 'Profile updated successfully.',
    });
  } catch (err) {
    console.error('[apiStudentUpdateProfile]', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
}

module.exports = {
  apiStudentProfile,
  apiStudentSimulate,
  apiStudentAdvisor,
  apiStudentUpdateProfile,
};