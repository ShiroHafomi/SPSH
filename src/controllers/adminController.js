/**
 * Admin Controller — User management, audit logs, system analytics.
 * All endpoints require admin role.
 */
const authService = require('../services/authService');
const studentService = require('../services/studentService');
const mlService = require('../services/mlService');
const { logAuditEvent } = require('../services/authService');
const { pool } = require('../config/db');
const fs = require('fs').promises;
const path = require('path');
const { encodeCsvRow } = require('../utils/csv');
const {
  boundedString,
  normalizeBulkFilters,
  normalizePositiveIds,
  parsePositiveSafeInteger,
} = require('../utils/inputValidation');

// Path to ML models and metrics
const ML_MODELS_DIR = path.join(__dirname, '..', '..', 'ml', 'models');
const METRICS_FILE = path.join(ML_MODELS_DIR, 'metrics.json');
const USER_ROLES = new Set(['admin', 'teacher', 'student']);

function validatePassword(password, errors) {
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters.');
    return;
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Password cannot exceed 72 UTF-8 bytes.');
    return;
  }
  if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter.');
  if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a digit.');
}

function normalizeBulkRequest(body, maxIds) {
  if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) {
    throw new TypeError('Request body must be an object.');
  }
  const payload = body || {};
  return {
    ids: normalizePositiveIds(payload.ids, { max: maxIds }),
    filters: normalizeBulkFilters(payload.filters),
  };
}

function validationError(res, error) {
  if (error instanceof TypeError || error instanceof RangeError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

/**
 * GET /api/admin/users
 * List all users with pagination and filters.
 */
async function apiListUsers(req, res) {
  try {
    const page = Math.max(1, parsePositiveSafeInteger(req.query.page) || 1);
    const size = Math.min(100, parsePositiveSafeInteger(req.query.size) || 20);
    const role = req.query.role || 'all';
    if (role !== 'all' && !USER_ROLES.has(role)) {
      return res.status(400).json({ error: 'Invalid role filter.' });
    }
    const search = boundedString(req.query.q, { field: 'q', max: 200 });

    const offset = (page - 1) * size;
    const conditions = ['role != ?']; // Exclude system accounts if any
    const values = ['admin']; // Don't hide admin users

    if (role !== 'all') {
      conditions.push('role = ?');
      values.push(role);
    }

    if (search) {
      conditions.push('(email LIKE ? OR name LIKE ?)');
      values.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [users] = await pool.query(
      `SELECT id, email, name, role, student_id, department, is_active, last_login_at, created_at
       FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, size, offset]
    );

    const [{ total }] = await pool.query(
      `SELECT COUNT(*) AS total FROM users ${whereClause}`,
      values
    );

    res.json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / size),
      size,
    });
  } catch (err) {
    console.error('[apiListUsers]', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
}

/**
 * POST /api/admin/users
 * Create a new user with specified role (admin only).
 */
async function apiCreateUser(req, res) {
  const { email, password, name, role = 'student', studentId, department } = req.body || {};

  // Validation
  const errors = [];
  if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('Valid email is required.');
  }
  validatePassword(password, errors);
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    errors.push('Name must be between 2 and 100 characters.');
  }
  if (!USER_ROLES.has(role)) {
    errors.push('Invalid role. Must be admin, teacher, or student.');
  }
  const linkedStudentId = studentId === undefined || studentId === null || studentId === ''
    ? null
    : parsePositiveSafeInteger(studentId);
  if (role === 'student'
      && studentId !== undefined
      && studentId !== null
      && studentId !== ''
      && linkedStudentId === null) {
    errors.push('studentId must be a positive integer.');
  }
  if (department !== undefined && department !== null
      && (typeof department !== 'string' || department.trim().length > 100)) {
    errors.push('Department cannot exceed 100 characters.');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await authService.emailExists(normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // If student role, verify studentId exists in students table.
    if (role === 'student' && linkedStudentId !== null) {
      const student = await studentService.findById(linkedStudentId);
      if (!student) {
        return res.status(400).json({ error: 'Student ID does not exist in students table.' });
      }
    }

    const user = await authService.createUser({
      email: normalizedEmail,
      password,
      name: name.trim(),
      role,
      studentId: role === 'student' ? linkedStudentId : null,
      department: role === 'teacher' && typeof department === 'string'
        ? (department.trim() || null)
        : null,
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE_USER',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { createdUserRole: role, createdUserEmail: user.email },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error('[apiCreateUser]', err);
    res.status(500).json({ error: 'Failed to create user.' });
  }
}

/**
 * PUT /api/admin/users/:id
 * Update user details (name, role, password, department, isActive).
 */
async function apiUpdateUser(req, res) {
  const id = parsePositiveSafeInteger(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'User ID must be a positive integer.' });
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be an object.' });
  }

  const { name, role, password, department, isActive } = req.body;
  const errors = [];
  if (name !== undefined
      && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
    errors.push('Name must be between 2 and 100 characters.');
  }
  if (role !== undefined && !USER_ROLES.has(role)) {
    errors.push('Invalid role. Must be admin, teacher, or student.');
  }
  if (password !== undefined) validatePassword(password, errors);
  if (department !== undefined && department !== null
      && (typeof department !== 'string' || department.trim().length > 100)) {
    errors.push('Department cannot exceed 100 characters.');
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push('isActive must be a boolean.');
  }
  if ([name, role, password, department, isActive].every((value) => value === undefined)) {
    errors.push('At least one supported field is required.');
  }
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors });
  }

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot modify your own account via this endpoint.' });
  }

  try {
    const targetUser = await authService.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Preserve at least one admin and one active admin.
    if (targetUser.role === 'admin'
        && ((role !== undefined && role !== 'admin') || isActive === false)) {
      const [{ adminCount, activeAdminCount }] = await pool.query(
        `SELECT COUNT(*) AS adminCount,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeAdminCount
         FROM users WHERE role = ?`,
        ['admin']
      );
      if (role !== undefined && role !== 'admin' && adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin user.' });
      }
      if (isActive === false && Boolean(targetUser.is_active) && activeAdminCount <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last active admin user.' });
      }
    }

    const changes = {
      name: name === undefined ? undefined : name.trim(),
      role,
      password,
      department: department === undefined
        ? undefined
        : (typeof department === 'string' ? (department.trim() || null) : null),
      isActive,
    };
    const updated = await authService.updateUser(id, changes);

    if (!updated) {
      return res.status(404).json({ error: 'User not found or no changes made.' });
    }

    const changedFields = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field === 'password' ? 'password' : field);
    const auditMetadata = { changedFields };
    if (role !== undefined) {
      auditMetadata.roleChange = { from: targetUser.role, to: role };
    }
    if (isActive !== undefined) {
      auditMetadata.activeChange = {
        from: Boolean(targetUser.is_active),
        to: isActive,
      };
    }
    if (password !== undefined) auditMetadata.passwordChanged = true;

    // Log only field names and non-secret security transitions.
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_USER',
      resourceType: 'user',
      resourceId: id,
      metadata: auditMetadata,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    // Fetch updated user
    const updatedUser = await authService.getUserById(id);
    res.json({ user: updatedUser });
  } catch (err) {
    console.error('[apiUpdateUser]', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
}

/**
 * DELETE /api/admin/users/:id
 * Delete a user (admin only, cannot delete self).
 */
async function apiDeleteUser(req, res) {
  const id = parsePositiveSafeInteger(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'User ID must be a positive integer.' });
  }

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  try {
    const targetUser = await authService.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Admin accounts must be demoted before deletion.
    if (targetUser.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts must be demoted before deletion.' });
    }

    const affected = await authService.deleteUser(id);
    if (affected === 0) {
      return res.status(404).json({ error: 'User not found or could not be deleted.' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'DELETE_USER',
      resourceType: 'user',
      resourceId: id,
      metadata: { deletedUserRole: targetUser.role, deletedUserEmail: targetUser.email },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[apiDeleteUser]', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
}

/**
 * GET /api/admin/audit-logs
 * Get audit logs with pagination and filters.
 */
async function apiGetAuditLogs(req, res) {
  try {
    const page = parsePositiveSafeInteger(req.query.page) || 1;
    const size = Math.min(100, parsePositiveSafeInteger(req.query.size) || 50);
    const action = boundedString(req.query.action, { field: 'action', max: 50 });
    const resourceType = boundedString(req.query.resource_type, {
      field: 'resource_type',
      max: 50,
    });
    const userId = req.query.user_id === undefined || req.query.user_id === ''
      ? null
      : parsePositiveSafeInteger(req.query.user_id);
    if (req.query.user_id !== undefined && req.query.user_id !== '' && userId === null) {
      return res.status(400).json({ error: 'user_id must be a positive integer.' });
    }

    const result = await authService.getAuditLogs({ page, size, action, resourceType, userId });
    res.json(result);
  } catch (err) {
    if (validationError(res, err)) return;
    console.error('[apiGetAuditLogs]', err);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
}

/**
 * GET /api/admin/analytics
 * System-wide analytics for admin dashboard.
 */
async function apiAdminAnalytics(req, res) {
  try {
    // Get user counts by role
    const [userStatsRows] = await pool.query(`
      SELECT
        COUNT(*) as totalUsers,
        SUM(role = 'admin') as adminCount,
        SUM(role = 'teacher') as teacherCount,
        SUM(role = 'student') as studentCount,
        SUM(is_active = 1) as activeUsers,
        SUM(last_login_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as activeLast24h
      FROM users
    `);

    // Student analytics: kpis + charts + filterOptions (shape the frontend reads)
    const studentAnalytics = await studentService.getAdminAnalytics();

    // Get recent login activity
    const [recentLogins] = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count, action
      FROM audit_logs
      WHERE action = 'LOGIN' AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at), action
      ORDER BY date DESC
    `);

    // Spread studentAnalytics so kpis/charts/filterOptions live at the top level
    // (matches AdminDashboard.jsx: `const { kpis, charts } = analytics`).
    // userStats/recentLogins kept alongside for any other consumers; `studentStats`
    // retained as an alias so the old response shape stays a (non-breaking) superset.
    res.json({
      ...studentAnalytics,
      studentStats: studentAnalytics,
      userStats: userStatsRows[0] || {},
      recentLogins,
    });
  } catch (err) {
    console.error('[apiAdminAnalytics]', err);
    res.status(500).json({ error: 'Failed to load admin analytics.' });
  }
}

/**
 * GET /api/admin/at-risk — Get at-risk students with risk assessment
 */
async function apiAdminAtRisk(req, res) {
  try {
    const attendance = parseInt(req.query.attendance, 10) || 75;
    const studyHours = parseFloat(req.query.study_hours) || 2;
    const gpa = parseFloat(req.query.gpa) || 2.5;

    const result = await studentService.getAtRiskStudents({ attendance, studyHours, gpa });

    // Add risk_level and risk_score to each student for frontend
    const studentsWithRisk = result.students.map(student => {
      let riskScore = 0;
      let riskFactors = [];

      if (student.attendance_percent !== null && student.attendance_percent < attendance) {
        riskScore += (attendance - student.attendance_percent);
        riskFactors.push('attendance');
      }
      if (student.study_hours_per_day !== null && student.study_hours_per_day < studyHours) {
        riskScore += (studyHours - student.study_hours_per_day) * 10;
        riskFactors.push('study_hours');
      }
      if (student.previous_gpa !== null && student.previous_gpa < gpa) {
        riskScore += (gpa - student.previous_gpa) * 20;
        riskFactors.push('gpa');
      }

      let riskLevel = 'low';
      if (riskScore >= 30) riskLevel = 'high';
      else if (riskScore >= 15) riskLevel = 'medium';

      return {
        ...student,
        risk_level: riskLevel,
        risk_score: Math.round(riskScore),
        risk_factors: riskFactors,
      };
    });

    res.json({
      students: studentsWithRisk,
      total: studentsWithRisk.length,
      thresholds: { attendance, study_hours: studyHours, gpa }
    });
  } catch (err) {
    console.error('[apiAdminAtRisk]', err);
    res.status(500).json({ error: 'Failed to load at-risk students.' });
  }
}

/**
 * GET /api/admin/students — Filtered student list with pagination
 */
async function apiAdminListStudents(req, res) {
  const { loadSchemaMap, getDisplayColumns, getSchemaMap } = require('../utils/schemaMap');

  try {
    loadSchemaMap();
    const normalized = normalizeBulkFilters({
      q: req.query.q,
      grade: req.query.grade,
      gender: req.query.gender,
      part_time_job: req.query.part_time_job,
      parental_education: req.query.parental_education,
      at_risk: req.query.at_risk,
    });
    const q = normalized.q || '';
    const sort = boundedString(req.query.sort, { field: 'sort', max: 100 }) || 'id';
    const dir = boundedString(req.query.dir, { field: 'dir', max: 4 }) || 'asc';
    const page = parsePositiveSafeInteger(req.query.page) || 1;
    const size = Math.min(100, parsePositiveSafeInteger(req.query.size) || 20);
    const filters = {
      grade: normalized.grade || 'all',
      gender: normalized.gender || 'all',
      part_time_job: normalized.part_time_job || 'all',
      parental_education: normalized.parental_education || 'all',
      at_risk: normalized.at_risk || 'all',
    };

    const [rows, total] = await Promise.all([
      studentService.listStudents({ q, sort, dir, page, size, filters }),
      studentService.countStudents({ q, filters }),
    ]);

    const totalPages = Math.ceil(total / size);
    const columns = getDisplayColumns();
    const schemaMap = getSchemaMap();

    res.json({ rows, total, page, totalPages, columns, schemaMap, filters });
  } catch (err) {
    if (validationError(res, err)) return;
    console.error('[apiAdminListStudents]', err);
    res.status(500).json({ error: 'Failed to load students.' });
  }
}

/**
 * POST /api/admin/students/bulk-export — Export filtered students as CSV
 */
async function apiAdminBulkExport(req, res) {
  try {
    const { ids, filters } = normalizeBulkRequest(req.body, 100);
    const rows = await studentService.getStudentsForBulk({
      ids,
      filters,
      size: 100,
    });

    const { getDisplayColumns, loadSchemaMap } = require('../utils/schemaMap');
    loadSchemaMap();
    const displayCols = getDisplayColumns();
    const csvRows = [
      encodeCsvRow(['id', ...displayCols.map((column) => column.name)]),
      ...rows.map((row) => encodeCsvRow([
        row.id,
        ...displayCols.map((column) => row[column.name]),
      ])),
    ];
    const csv = csvRows.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="students-export-${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.send(csv);
  } catch (err) {
    if (validationError(res, err)) return;
    console.error('[apiAdminBulkExport]', err);
    res.status(500).json({ error: 'Failed to export students.' });
  }
}

/**
 * POST /api/admin/students/bulk-ai-evaluate — Run AI evaluation on multiple students
 */
async function apiAdminBulkAiEvaluate(req, res) {
  try {
    const { ids, filters } = normalizeBulkRequest(req.body, 50);
    const rows = await studentService.getStudentsForBulk({ ids, filters, size: 50 });

    const studentIds = rows.map(s => s.id);

    // Use centralized batch prediction (sequential, respects runner concurrency cap)
    let batchResults;
    try {
      batchResults = await mlService.batchPredict(studentIds);
    } catch (err) {
      if (err.message === 'ML capacity exceeded') {
        return res.status(503).json({ error: 'ML service temporarily unavailable, please retry' });
      }
      throw err;
    }

    // Build results with intervention notes for successful predictions
    const { generateInterventionNote } = require('../services/aiCounselService');
    const results = await Promise.all(batchResults.map(async (item) => {
      if (item.error) {
        return {
          studentId: item.studentId,
          student_id: rows.find(s => s.id === item.studentId)?.student_id ?? null,
          error: 'Prediction failed for this student.',
        };
      }
      try {
        const student = rows.find(s => s.id === item.studentId);
        const noteResult = await generateInterventionNote(item.studentId, null, item.prediction);
        return {
          studentId: item.studentId,
          student_id: student?.student_id ?? null,
          interventionNote: noteResult.interventionNote,
          prediction: {
            final_score: item.prediction.final_score,
            grade: item.prediction.grade,
            grade_confidence: item.prediction.grade_confidence,
            grade_probabilities: item.prediction.grade_probabilities,
          },
        };
      } catch (err) {
        console.error(`[apiAdminBulkAiEvaluate] student ${item.studentId}`, err);
        return {
          studentId: item.studentId,
          student_id: rows.find(s => s.id === item.studentId)?.student_id ?? null,
          error: 'Evaluation failed for this student.',
        };
      }
    }));

    res.json({ results });
  } catch (err) {
    if (validationError(res, err)) return;
    console.error('[apiAdminBulkAiEvaluate]', err);
    res.status(500).json({ error: 'Failed to run bulk AI evaluation.' });
  }
}

/**
 * POST /api/admin/students/:id/intervention — Generate intervention note for a student
 */
async function apiAdminGenerateIntervention(req, res) {
  const id = parsePositiveSafeInteger(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Student ID must be a positive integer.' });
  }

  try {
    const student = await studentService.findById(id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Get prediction first
    let prediction;
    try {
      prediction = await mlService.predictForStudent(id);
    } catch (err) {
      if (err.message === 'ML capacity exceeded') {
        return res.status(503).json({ error: 'Intervention service temporarily unavailable, please retry' });
      }
      throw err;
    }

    // Generate intervention note using prediction
    const { generateInterventionNote } = require('../services/aiCounselService');
    const result = await generateInterventionNote(id, null, prediction);
    res.json(result);
  } catch (err) {
    console.error('[apiAdminGenerateIntervention]', err);
    res.status(500).json({ error: 'Failed to generate intervention note.' });
  }
}

/**
 * POST /api/admin/students/:id/summarize-habits — Generate habit summary for notes
 */
async function apiAdminSummarizeHabits(req, res) {
  const id = parsePositiveSafeInteger(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Student ID must be a positive integer.' });
  }

  try {
    const student = await studentService.findById(id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const result = await studentService.summarizeHabits(id);
    res.json(result);
  } catch (err) {
    console.error('[apiAdminSummarizeHabits]', err);
    res.status(500).json({ error: 'Failed to summarize habits.' });
  }
}

/**
 * GET /api/admin/ml-health — Get ML model health metrics and training info
 */
async function apiAdminMlHealth(req, res) {
  try {
    // Read metrics.json
    let metrics = null;
    let metricsError = null;
    try {
      const metricsContent = await fs.readFile(METRICS_FILE, 'utf-8');
      metrics = JSON.parse(metricsContent);
    } catch (err) {
      metricsError = err.message;
    }

    // Get model file stats
    const modelFiles = ['regressor.joblib', 'classifier.joblib', 'preprocessor.joblib', 'metrics.json'];
    const fileStats = {};
    let totalSize = 0;
    let newestTimestamp = null;
    let oldestTimestamp = null;

    for (const file of modelFiles) {
      const filePath = path.join(ML_MODELS_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        fileStats[file] = {
          sizeBytes: stats.size,
          sizeKB: Math.round(stats.size / 1024),
          modifiedAt: stats.mtime.toISOString(),
        };
        totalSize += stats.size;
        if (!newestTimestamp || stats.mtime > newestTimestamp) newestTimestamp = stats.mtime;
        if (!oldestTimestamp || stats.mtime < oldestTimestamp) oldestTimestamp = stats.mtime;
      } catch (err) {
        fileStats[file] = { error: 'Not found' };
      }
    }

    // Calculate model age in days
    const modelAgeDays = newestTimestamp ? Math.floor((Date.now() - newestTimestamp.getTime()) / (1000 * 60 * 60 * 24)) : null;

    // Determine overall health status
    let healthStatus = 'unknown';
    let healthIssues = [];

    if (metricsError) {
      healthStatus = 'error';
      healthIssues.push('Metrics file not found or corrupted');
    } else if (!metrics) {
      healthStatus = 'warning';
      healthIssues.push('No metrics data available');
    } else {
      // Check data freshness
      if (modelAgeDays !== null && modelAgeDays > 30) {
        healthStatus = healthStatus === 'unknown' ? 'warning' : healthStatus;
        healthIssues.push(`Models are ${modelAgeDays} days old (retraining recommended)`);
      } else if (modelAgeDays !== null && modelAgeDays > 7) {
        healthStatus = healthStatus === 'unknown' ? 'healthy' : healthStatus;
        healthIssues.push(`Models are ${modelAgeDays} days old`);
      } else {
        healthStatus = healthStatus === 'unknown' ? 'healthy' : healthStatus;
      }

      // Check regression performance
      if (metrics.regression?.best_model && metrics.regression.cv_results) {
        const bestReg = metrics.regression.cv_results[metrics.regression.best_model];
        if (bestReg && bestReg.r2_mean < 0.95) {
          healthStatus = 'warning';
          healthIssues.push(`Regression R² (${bestReg.r2_mean.toFixed(3)}) below 0.95`);
        }
      }

      // Check classification performance
      if (metrics.classification?.best_model && metrics.classification.cv_results) {
        const bestClf = metrics.classification.cv_results[metrics.classification.best_model];
        if (bestClf && bestClf.accuracy_mean < 0.85) {
          healthStatus = 'warning';
          healthIssues.push(`Classification accuracy (${bestClf.accuracy_mean.toFixed(3)}) below 0.85`);
        }
        // Check overfitting
        if (bestClf && bestClf.accuracy_train_mean && bestClf.accuracy_mean) {
          const overfitGap = bestClf.accuracy_train_mean - bestClf.accuracy_mean;
          if (overfitGap > 0.15) {
            healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
            healthIssues.push(`Classification overfitting detected (gap: ${(overfitGap * 100).toFixed(1)}%)`);
          }
        }
      }

      // Check training data size
      if (metrics.data_info?.n_samples < 100) {
        healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
        healthIssues.push(`Training data small (${metrics.data_info.n_samples} samples)`);
      }
    }

    // Check if models exist
    const hasRegressor = !fileStats['regressor.joblib']?.error;
    const hasClassifier = !fileStats['classifier.joblib']?.error;
    const hasPreprocessor = !fileStats['preprocessor.joblib']?.error;

    if (!hasRegressor || !hasClassifier || !hasPreprocessor) {
      healthStatus = 'error';
      healthIssues.push('Model files missing');
    }

    // Last training timestamp
    const lastTrainingAt = metrics?.timestamp || (newestTimestamp ? newestTimestamp.toISOString() : null);

    res.json({
      status: healthStatus, // 'healthy' | 'warning' | 'error' | 'unknown'
      issues: healthIssues,
      lastTrainingAt,
      modelAgeDays,
      dataInfo: metrics?.data_info || null,
      regression: metrics?.regression ? {
        bestModel: metrics.regression.best_model,
        cvR2: metrics.regression.cv_results?.[metrics.regression.best_model]?.r2_mean || null,
        cvRMSE: metrics.regression.cv_results?.[metrics.regression.best_model]?.rmse_mean || null,
        trainR2: metrics.regression.cv_results?.[metrics.regression.best_model]?.r2_train_mean || null,
        overfitGap: (metrics.regression.cv_results?.[metrics.regression.best_model]?.r2_train_mean || 0) -
                    (metrics.regression.cv_results?.[metrics.regression.best_model]?.r2_mean || 0),
      } : null,
      classification: metrics?.classification ? {
        bestModel: metrics.classification.best_model,
        cvAccuracy: metrics.classification.cv_results?.[metrics.classification.best_model]?.accuracy_mean || null,
        cvF1Weighted: metrics.classification.cv_results?.[metrics.classification.best_model]?.f1_weighted_mean || null,
        trainAccuracy: metrics.classification.cv_results?.[metrics.classification.best_model]?.accuracy_train_mean || null,
        overfitGap: (metrics.classification.cv_results?.[metrics.classification.best_model]?.accuracy_train_mean || 0) -
                    (metrics.classification.cv_results?.[metrics.classification.best_model]?.accuracy_mean || 0),
        gradeMap: metrics.classification.grade_map || null,
      } : null,
      cvStrategy: metrics?.cv_strategy || null,
      trainingDurationSec: metrics?.training_duration_sec || null,
      fileStats,
      totalModelSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    console.error('[apiAdminMlHealth]', err);
    res.status(500).json({ error: 'Failed to load ML health metrics.' });
  }
}

module.exports = {
  apiListUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiGetAuditLogs,
  apiAdminAnalytics,
  apiAdminAtRisk,
  apiAdminListStudents,
  apiAdminBulkExport,
  apiAdminBulkAiEvaluate,
  apiAdminGenerateIntervention,
  apiAdminSummarizeHabits,
  apiAdminMlHealth,
};