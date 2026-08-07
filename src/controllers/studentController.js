/**
 * Student Controller — Personal profile, risk alerts, what-if simulator, AI advisor.
 * All endpoints require student role (or admin/teacher with studentId).
 */
const studentService = require('../services/studentService');
const { runWhatIfSimulation } = require('../services/mlService');
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

    const student = await studentService.findByStudentId(studentId);

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

    const student = await studentService.findByStudentId(studentId);
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

    // Build input for prediction
    const currentFeatures = {
      gender: student.gender,
      age: student.age,
      study_hours_per_day: study_hours_per_day !== undefined ? parseFloat(study_hours_per_day) : student.study_hours_per_day,
      attendance_percent: attendance_percent !== undefined ? parseInt(attendance_percent, 10) : student.attendance_percent,
      sleep_hours: sleep_hours !== undefined ? parseFloat(sleep_hours) : student.sleep_hours,
      previous_gpa: student.previous_gpa,
      parental_education: student.parental_education,
      internet_access: student.internet_access,
      extracurricular: student.extracurricular,
      part_time_job: student.part_time_job,
    };

    // Run prediction with current values (baseline)
    const currentPrediction = await runWhatIfSimulation(student, {});

    // Run prediction with modified values
    const modifiedPrediction = await runWhatIfSimulation(student, {
      study_hours_per_day: currentFeatures.study_hours_per_day,
      sleep_hours: currentFeatures.sleep_hours,
      attendance_percent: currentFeatures.attendance_percent,
    });

    // Generate recommendations based on the difference
    const recommendations = generateRecommendations(student, currentPrediction, modifiedPrediction);

    res.json({
      current: currentPrediction,
      simulated: modifiedPrediction,
      recommendations,
      inputs: {
        study_hours_per_day: currentFeatures.study_hours_per_day,
        sleep_hours: currentFeatures.sleep_hours,
        attendance_percent: currentFeatures.attendance_percent,
      },
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

    const student = await studentService.findByStudentId(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    // Get current prediction
    const prediction = await runWhatIfSimulation(student, {});

    // Generate personalized advice
    const advice = await generateStudentAdvice(student, prediction);

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
      currentGrade: prediction.grade,
      currentScore: prediction.final_score,
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

module.exports = {
  apiStudentProfile,
  apiStudentSimulate,
  apiStudentAdvisor,
};