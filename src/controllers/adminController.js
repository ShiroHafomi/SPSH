/**
 * Admin Controller — User management, audit logs, system analytics.
 * All endpoints require admin role.
 */
const authService = require('../services/authService');
const studentService = require('../services/studentService');
const { logAuditEvent } = require('../services/authService');
const { pool } = require('../config/db');

/**
 * GET /api/admin/users
 * List all users with pagination and filters.
 */
async function apiListUsers(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const size = parseInt(req.query.size, 10) || 20;
    const role = req.query.role || 'all';
    const search = req.query.q || '';

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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('Valid email is required.');
  }
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  } else {
    if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter.');
    if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter.');
    if (!/[0-9]/.test(password)) errors.push('Password must contain a digit.');
  }
  if (!name || name.trim().length < 2) {
    errors.push('Name is required (minimum 2 characters).');
  }
  if (!['admin', 'teacher', 'student'].includes(role)) {
    errors.push('Invalid role. Must be admin, teacher, or student.');
  }
  if (role === 'student' && studentId !== undefined && studentId !== null && isNaN(parseInt(studentId))) {
    errors.push('studentId must be a number.');
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

    // If student role, verify studentId exists in students table
    if (role === 'student' && studentId) {
      const student = await studentService.findById(parseInt(studentId));
      if (!student) {
        return res.status(400).json({ error: 'Student ID does not exist in students table.' });
      }
    }

    const user = await authService.createUser({
      email: normalizedEmail,
      password,
      name: name.trim(),
      role,
      studentId: studentId ? parseInt(studentId) : null,
      department: department?.trim() || null,
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
  const id = parseInt(req.params.id, 10);
  const { name, role, password, department, isActive } = req.body || {};

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot modify your own account via this endpoint.' });
  }

  try {
    const targetUser = await authService.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Prevent demoting the last admin
    if (targetUser.role === 'admin' && role && role !== 'admin') {
      const [{ adminCount }] = await pool.query(
        'SELECT COUNT(*) AS adminCount FROM users WHERE role = ?',
        ['admin']
      );
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin user.' });
      }
    }

    const updated = await authService.updateUser(id, { name, role, password, department, isActive });

    if (!updated) {
      return res.status(404).json({ error: 'User not found or no changes made.' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_USER',
      resourceType: 'user',
      resourceId: id,
      metadata: { changes: req.body },
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
  const id = parseInt(req.params.id, 10);

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  try {
    const targetUser = await authService.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Prevent deleting the last admin
    if (targetUser.role === 'admin') {
      const [{ adminCount }] = await pool.query(
        'SELECT COUNT(*) AS adminCount FROM users WHERE role = ?',
        ['admin']
      );
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user.' });
      }
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
    const page = parseInt(req.query.page, 10) || 1;
    const size = parseInt(req.query.size, 10) || 50;
    const action = req.query.action || '';
    const resourceType = req.query.resource_type || '';
    const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : null;

    const result = await authService.getAuditLogs({ page, size, action, resourceType, userId });
    res.json(result);
  } catch (err) {
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
    const [{ userStats }] = await pool.query(`
      SELECT
        COUNT(*) as totalUsers,
        SUM(role = 'admin') as adminCount,
        SUM(role = 'teacher') as teacherCount,
        SUM(role = 'student') as studentCount,
        SUM(is_active = 1) as activeUsers,
        SUM(last_login_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as activeLast24h
      FROM users
    `);

    // Get student stats
    const studentStats = await studentService.getAdminAnalytics();

    // Get recent login activity
    const [recentLogins] = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count, action
      FROM audit_logs
      WHERE action = 'LOGIN' AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at), action
      ORDER BY date DESC
    `);

    res.json({
      userStats: userStats[0] || {},
      studentStats,
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
  loadSchemaMap();

  const q = req.query.q || '';
  const sort = req.query.sort || 'id';
  const dir = req.query.dir || 'asc';
  const page = parseInt(req.query.page, 10) || 1;
  const size = parseInt(req.query.size, 10) || 20;

  // Parse filters from query params
  const filters = {
    grade: req.query.grade || 'all',
    gender: req.query.gender || 'all',
    part_time_job: req.query.part_time_job || 'all',
    parental_education: req.query.parental_education || 'all',
    at_risk: req.query.at_risk || 'all',
  };

  try {
    const [rows, total] = await Promise.all([
      studentService.listStudents({ q, sort, dir, page, size, filters }),
      studentService.countStudents({ q, filters }),
    ]);

    const totalPages = Math.ceil(total / size);
    const columns = getDisplayColumns();
    const schemaMap = getSchemaMap();

    res.json({ rows, total, page, totalPages, columns, schemaMap, filters });
  } catch (err) {
    console.error('[apiAdminListStudents]', err);
    res.status(500).json({ error: 'Failed to load students.' });
  }
}

/**
 * POST /api/admin/students/bulk-export — Export filtered students as CSV
 */
async function apiAdminBulkExport(req, res) {
  const { ids = [], filters = {} } = req.body || {};

  try {
    const rows = await studentService.getStudentsForBulk({ ids, filters });

    // Generate CSV
    const { getDisplayColumns, loadSchemaMap } = require('../utils/schemaMap');
    loadSchemaMap();
    const displayCols = getDisplayColumns();

    const header = ['id', ...displayCols.map(c => c.name)].join(',');
    const csvRows = rows.map(row => {
      return [row.id, ...displayCols.map(c => {
        const val = row[c.name];
        if (val === null || val === undefined) return '';
        // Escape commas and quotes
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })].join(',');
    });

    const csv = [header, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="students-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[apiAdminBulkExport]', err);
    res.status(500).json({ error: 'Failed to export students.' });
  }
}

/**
 * POST /api/admin/students/bulk-ai-evaluate — Run AI evaluation on multiple students
 */
async function apiAdminBulkAiEvaluate(req, res) {
  const { ids = [], filters = {} } = req.body || {};

  try {
    const rows = await studentService.getStudentsForBulk({ ids, filters, size: 50 }); // Limit to 50

    // For each student, generate AI feedback
    const results = [];
    for (const student of rows) {
      try {
        const noteResult = await studentService.generateInterventionNote(student.id);
        results.push({
          studentId: student.id,
          student_id: student.student_id,
          interventionNote: noteResult.interventionNote,
        });
      } catch (e) {
        results.push({
          studentId: student.id,
          student_id: student.student_id,
          error: e.message,
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('[apiAdminBulkAiEvaluate]', err);
    res.status(500).json({ error: 'Failed to run bulk AI evaluation.' });
  }
}

/**
 * POST /api/admin/students/:id/intervention — Generate intervention note for a student
 */
async function apiAdminGenerateIntervention(req, res) {
  const id = parseInt(req.params.id, 10);

  try {
    const result = await studentService.generateInterventionNote(id);
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
  const id = parseInt(req.params.id, 10);

  try {
    const result = await studentService.summarizeHabits(id);
    res.json(result);
  } catch (err) {
    console.error('[apiAdminSummarizeHabits]', err);
    res.status(500).json({ error: 'Failed to summarize habits.' });
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
};