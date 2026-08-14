/**
 * Teacher Controller — Class analytics, student management, at-risk, AI counseling.
 * All endpoints require teacher or admin role.
 */
const studentService = require('../services/studentService');
const { logAuditEvent } = require('../services/authService');
const { generateInterventionNote } = require('../services/aiCounselService');
const mlService = require('../services/mlService');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

/**
 * GET /api/teacher/analytics
 * Class analytics dashboard with KPIs and chart data.
 */
async function apiTeacherAnalytics(req, res) {
  try {
    const analytics = await studentService.getTeacherAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error('[apiTeacherAnalytics]', err);
    res.status(500).json({ error: 'Failed to load teacher analytics.' });
  }
}

/**
 * GET /api/teacher/students
 * Searchable, filterable, paginated student list for teachers.
 */
async function apiTeacherStudents(req, res) {
  try {
    const q = req.query.q || '';
    const sort = req.query.sort || 'student_id';
    const dir = req.query.dir || 'asc';
    const page = parseInt(req.query.page, 10) || 1;
    const size = parseInt(req.query.size, 10) || 20;

    const filters = {
      grade: req.query.grade || 'all',
      gender: req.query.gender || 'all',
      part_time_job: req.query.part_time_job || 'all',
      parental_education: req.query.parental_education || 'all',
      at_risk: req.query.at_risk || 'all',
    };

    const [rows, total] = await Promise.all([
      studentService.listStudents({ q, sort, dir, page, size, filters }),
      studentService.countStudents({ q, filters }),
    ]);

    const totalPages = Math.ceil(total / size);

    // Get filter options for dropdowns
    const [grades, genders, partTimeJobs, parentalEducations] = await Promise.all([
      studentService.getDistinctValues('grade'),
      studentService.getDistinctValues('gender'),
      studentService.getDistinctValues('part_time_job'),
      studentService.getDistinctValues('parental_education'),
    ]);

    res.json({
      rows,
      total,
      page,
      totalPages,
      size,
      filters,
      filterOptions: {
        grades: grades.filter(g => g !== null && g !== ''),
        genders: genders.filter(g => g !== null && g !== ''),
        partTimeJobs: partTimeJobs.filter(g => g !== null && g !== ''),
        parentalEducations: parentalEducations.filter(g => g !== null && g !== ''),
      },
    });
  } catch (err) {
    console.error('[apiTeacherStudents]', err);
    res.status(500).json({ error: 'Failed to load students.' });
  }
}

/**
 * GET /api/teacher/students/:id
 * Get single student detail for teacher.
 */
async function apiGetTeacherStudent(req, res) {
  try {
    const id = parsePositiveSafeInteger(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Student ID must be a positive integer.' });
    }
    const student = await studentService.findById(id);

    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Add risk assessment
    const risk = await studentService.assessStudentRisk(id);

    res.json({ student, risk });
  } catch (err) {
    console.error('[apiGetTeacherStudent]', err);
    res.status(500).json({ error: 'Failed to load student.' });
  }
}

/**
 * PUT /api/teacher/students/:id
 * Update student academic data (teacher can update grades, notes, etc.)
 */
async function apiUpdateTeacherStudent(req, res) {
  try {
    const id = parsePositiveSafeInteger(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Student ID must be a positive integer.' });
    }
    const data = { ...req.body };

    // Teachers can update: final_score, grade, notes, attendance_percent, study_hours_per_day, etc.
    // But not structural fields like student_id, gender, age
    const allowedFields = [
      'final_score', 'grade', 'notes',
      'attendance_percent', 'study_hours_per_day', 'sleep_hours',
      'previous_gpa', 'extracurricular', 'internet_access', 'part_time_job'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const updated = await studentService.updateStudent(id, updateData);
    if (!updated) {
      const existing = await studentService.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Student not found.' });
      }
      return res.status(400).json({ error: 'No student fields were changed.' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_STUDENT',
      resourceType: 'student',
      resourceId: id,
      metadata: { updatedFields: Object.keys(updateData) },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[apiUpdateTeacherStudent]', err);
    res.status(500).json({ error: 'Failed to update student.' });
  }
}

/**
 * GET /api/teacher/at-risk
 * At-risk students with configurable thresholds.
 */
async function apiTeacherAtRisk(req, res) {
  try {
    const thresholds = {
      attendance: parseInt(req.query.attendance, 10) || 75,
      studyHours: parseFloat(req.query.study_hours) || 2,
      gpa: parseFloat(req.query.gpa) || 2.5,
      sleepHours: parseFloat(req.query.sleep_hours) || 5.5,
    };

    const result = await studentService.getAtRiskStudents(thresholds);

    // Add risk level and factors
    const studentsWithRisk = result.students.map(student => {
      let riskScore = 0;
      let riskFactors = [];

      if (student.attendance_percent !== null && student.attendance_percent < thresholds.attendance) {
        riskScore += (thresholds.attendance - student.attendance_percent);
        riskFactors.push({ field: 'attendance', value: student.attendance_percent, threshold: thresholds.attendance });
      }
      if (student.study_hours_per_day !== null && student.study_hours_per_day < thresholds.studyHours) {
        riskScore += (thresholds.studyHours - student.study_hours_per_day) * 10;
        riskFactors.push({ field: 'study_hours', value: student.study_hours_per_day, threshold: thresholds.studyHours });
      }
      if (student.previous_gpa !== null && student.previous_gpa < thresholds.gpa) {
        riskScore += (thresholds.gpa - student.previous_gpa) * 20;
        riskFactors.push({ field: 'gpa', value: student.previous_gpa, threshold: thresholds.gpa });
      }
      if (student.sleep_hours !== null && student.sleep_hours < thresholds.sleepHours) {
        riskScore += (thresholds.sleepHours - student.sleep_hours) * 15;
        riskFactors.push({ field: 'sleep', value: student.sleep_hours, threshold: thresholds.sleepHours });
      }

      let riskLevel = 'low';
      if (riskScore >= 40) riskLevel = 'high';
      else if (riskScore >= 20) riskLevel = 'medium';

      return {
        ...student,
        risk_level: riskLevel,
        risk_score: Math.round(riskScore),
        risk_factors: riskFactors,
      };
    });

    // Sort by risk score descending
    studentsWithRisk.sort((a, b) => b.risk_score - a.risk_score);

    res.json({
      students: studentsWithRisk,
      total: studentsWithRisk.length,
      thresholds,
    });
  } catch (err) {
    console.error('[apiTeacherAtRisk]', err);
    res.status(500).json({ error: 'Failed to load at-risk students.' });
  }
}

/**
 * POST /api/teacher/ai-counsel
 * Generate AI counseling intervention note for at-risk student.
 */
async function apiTeacherAiCounsel(req, res) {
  try {
    const { customPrompt } = req.body || {};
    const studentId = parsePositiveSafeInteger(req.body?.studentId);

    if (studentId === null) {
      return res.status(400).json({ error: 'studentId must be a positive integer.' });
    }

    // Verify student exists
    const student = await studentService.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Get ML prediction first
    let prediction;
    try {
      prediction = await mlService.predictForStudent(studentId);
    } catch (err) {
      if (err.message === 'ML capacity exceeded') {
        return res.status(503).json({ error: 'Counsel service temporarily unavailable, please retry' });
      }
      throw err;
    }

    // Generate intervention note using prediction
    const result = await generateInterventionNote(studentId, customPrompt, prediction);

    // Save intervention note to student's notes
    await studentService.updateStudent(studentId, {
      notes: result.interventionNote,
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'AI_COUNSEL',
      resourceType: 'student',
      resourceId: studentId,
      metadata: { studentId: student.student_id },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json(result);
  } catch (err) {
    console.error('[apiTeacherAiCounsel]', err);
    res.status(500).json({ error: 'Failed to generate AI counseling note.' });
  }
}

module.exports = {
  apiTeacherAnalytics,
  apiTeacherStudents,
  apiGetTeacherStudent,
  apiUpdateTeacherStudent,
  apiTeacherAtRisk,
  apiTeacherAiCounsel,
};