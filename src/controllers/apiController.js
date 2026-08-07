/**
 * API Controller — JSON response handlers for the SPA frontend.
 * Every function calls existing services and returns JSON.
 */
const studentService = require('../services/studentService');
const authService = require('../services/authService');
const { getDisplayColumns, getSchemaMap, loadSchemaMap } = require('../utils/schemaMap');
const { buildColumnSets } = require('../utils/columns');
const { buildChartConfig } = require('../utils/chartConfig');
const { execFile } = require('child_process');
const path = require('path');
const { generateFeedback } = require('../utils/feedbackTemplates');

// ─── Auth ────────────────────────────────────────────────────────────────────

/** POST /api/auth/login */
async function apiLogin(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Normalize email: trim whitespace, lowercase
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const user = await authService.loginUser({ email: normalizedEmail, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Regenerate session ID on login to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('[apiLogin] session regenerate failed:', err);
        // Fallback: just set userId on existing session
        req.session.userId = user.id;
        return res.json({ user });
      }
      req.session.userId = user.id;
      res.json({ user });
    });
  } catch (err) {
    console.error('[apiLogin]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

/** POST /api/auth/register */
async function apiRegister(req, res) {
  const { name, email, password, confirm_password } = req.body || {};
  const errors = [];

  // Name
  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    errors.push('Name must be between 2 and 100 characters.');
  }

  // Email (normalize: trim + lowercase)
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.push('Please enter a valid email address.');
  }

  // Password strength: min 8 chars, at least one uppercase, one lowercase, one digit
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  } else {
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter.');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one digit.');
    }
  }

  if (password !== confirm_password) {
    errors.push('Passwords do not match.');
  }
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors });
  }

  try {
    const exists = await authService.emailExists(normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const user = await authService.registerUser({
      email: normalizedEmail,
      password,
      name: name.trim(),
    });

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('[apiRegister] session regenerate failed:', err);
        req.session.userId = user.id;
        return res.json({ user });
      }
      req.session.userId = user.id;
      res.json({ user });
    });
  } catch (err) {
    console.error('[apiRegister]', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
}

/** POST /api/auth/logout */
async function apiLogout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('[apiLogout]', err);
      return res.status(500).json({ error: 'Failed to logout.' });
    }
    res.json({ ok: true });
  });
}

/** GET /api/me */
async function apiMe(req, res) {
  const currentUser = res.locals.currentUser;
  if (!currentUser) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  res.json({ user: currentUser });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/** GET /api/dashboard/stats */
async function apiDashboardStats(req, res) {
  loadSchemaMap();

  try {
    const stats = await studentService.getDashboardStats();
    const chartConfig = buildChartConfig();

    const chartData = {
      kpis: chartConfig.kpis.map(k => ({
        label: k.label,
        key: k.key || k.column,
        value: stats[k.key || k.column] ?? stats.totalStudents,
        format: k.format,
      })),
      charts: chartConfig.charts.map(c => {
        if (c.type === 'bar') {
          return {
            type: 'bar',
            title: c.title,
            labels: stats.barChart?.map(d => d.label) || [],
            data: stats.barChart?.map(d => d.value) || [],
            xLabel: c.xColumn,
            yLabel: c.yColumn,
          };
        }
        if (c.type === 'scatter') {
          return {
            type: 'scatter',
            title: c.title,
            data: stats.scatterChart || [],
            xLabel: c.xLabel,
            yLabel: c.yLabel,
          };
        }
        if (c.type === 'histogram') {
          return {
            type: 'bar',
            title: c.title,
            labels: stats.histogramChart?.map(d => d.label) || [],
            data: stats.histogramChart?.map(d => d.count) || [],
            xLabel: c.label,
            yLabel: 'Count',
          };
        }
        return null;
      }).filter(Boolean),
    };

    res.json({ stats, chartData, chartConfig: chartConfig.meta });
  } catch (err) {
    console.error('[apiDashboardStats]', err);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
}

// ─── Students ────────────────────────────────────────────────────────────────

/** GET /api/students */
async function apiListStudents(req, res) {
  loadSchemaMap();
  buildColumnSets();

  const q = req.query.q || '';
  const sort = req.query.sort || 'id';
  const dir = req.query.dir || 'asc';
  const page = parseInt(req.query.page, 10) || 1;
  const size = parseInt(req.query.size, 10) || 20;

  try {
    const [rows, total] = await Promise.all([
      studentService.listStudents({ q, sort, dir, page, size }),
      studentService.countStudents({ q }),
    ]);

    const totalPages = Math.ceil(total / size);
    const columns = getDisplayColumns();
    const schemaMap = getSchemaMap();

    res.json({ rows, total, page, totalPages, columns, schemaMap });
  } catch (err) {
    console.error('[apiListStudents]', err);
    res.status(500).json({ error: 'Failed to load students.' });
  }
}

/** GET /api/students/:id */
async function apiGetStudent(req, res) {
  loadSchemaMap();
  const id = parseInt(req.params.id, 10);

  try {
    const student = await studentService.findById(id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const columns = getDisplayColumns();
    const schemaMap = getSchemaMap();
    res.json({ student, columns, schemaMap });
  } catch (err) {
    console.error('[apiGetStudent]', err);
    res.status(500).json({ error: 'Failed to load student.' });
  }
}

/** POST /api/students */
async function apiCreateStudent(req, res) {
  loadSchemaMap();
  const displayCols = getDisplayColumns();
  const data = {};

  for (const col of displayCols) {
    const val = req.body[col.name];
    if (val !== undefined && val !== '') {
      data[col.name] = val;
    }
  }

  // Validation
  const errors = validateStudentData(data, displayCols);
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors, fields: errors });
  }

  try {
    const id = await studentService.createStudent(data);
    res.json({ id });
  } catch (err) {
    console.error('[apiCreateStudent]', err);
    res.status(500).json({ error: 'Failed to create student.' });
  }
}

/** POST /api/students/:id */
async function apiUpdateStudent(req, res) {
  loadSchemaMap();
  const id = parseInt(req.params.id, 10);
  const displayCols = getDisplayColumns();
  const data = {};

  for (const col of displayCols) {
    if (req.body[col.name] !== undefined) {
      data[col.name] = req.body[col.name];
    }
  }

  const errors = validateStudentData(data, displayCols);
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors, fields: errors });
  }

  try {
    await studentService.updateStudent(id, data);
    res.json({ ok: true });
  } catch (err) {
    console.error('[apiUpdateStudent]', err);
    res.status(500).json({ error: 'Failed to update student.' });
  }
}

/** POST /api/students/:id/delete */
async function apiDeleteStudent(req, res) {
  const id = parseInt(req.params.id, 10);

  try {
    await studentService.deleteStudent(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[apiDeleteStudent]', err);
    res.status(500).json({ error: 'Failed to delete student.' });
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** GET /api/admin/users */
async function apiListUsers(req, res) {
  try {
    const users = await authService.listUsers();
    res.json({ users });
  } catch (err) {
    console.error('[apiListUsers]', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
}

/** POST /api/admin/users/:id/delete */
async function apiDeleteUser(req, res) {
  const id = parseInt(req.params.id, 10);

  if (id === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  try {
    const affected = await authService.deleteUser(id);
    if (affected === 0) {
      return res.status(400).json({
        error: 'User not found or cannot be deleted (admin accounts are protected).',
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[apiDeleteUser]', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
}

// ─── ML Prediction ─────────────────────────────────────────────────────────────

/** POST /api/predict - Predict student performance */
async function apiPredict(req, res) {
  const input = req.body || {};

  // Validate required fields
  const requiredFields = ['gender', 'age', 'study_hours_per_day', 'attendance_percent',
                          'sleep_hours', 'previous_gpa', 'parental_education',
                          'internet_access', 'extracurricular', 'part_time_job'];
  const missing = requiredFields.filter(f => input[f] === undefined || input[f] === null || input[f] === '');
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields',
      missing,
      required: requiredFields
    });
  }

  // Convert Yes/No to 1/0 for binary features
  const pythonInput = { ...input };
  for (const key of ['internet_access', 'extracurricular', 'part_time_job']) {
    if (typeof pythonInput[key] === 'string') {
      pythonInput[key] = pythonInput[key].toLowerCase() === 'yes' ? 1 : 0;
    }
  }

  // Path to inference script
  const scriptPath = path.join(__dirname, '..', '..', 'ml', 'inference.py');

  // Run Python inference
  execFile('py', [scriptPath, '--json', '-'], {
    maxBuffer: 1024 * 1024,
    timeout: 30000,
  }, (error, stdout, stderr) => {
    if (error) {
      console.error('[apiPredict] Python error:', error);
      console.error('[apiPredict] stderr:', stderr);
      return res.status(500).json({ error: 'Prediction failed', details: stderr });
    }

    try {
      // Parse JSON from stdout
      const result = JSON.parse(stdout.trim());
      res.json(result);
    } catch (parseErr) {
      console.error('[apiPredict] Parse error:', parseErr);
      console.error('[apiPredict] stdout:', stdout);
      res.status(500).json({ error: 'Failed to parse prediction result' });
    }
  }).stdin.write(JSON.stringify(pythonInput)).end();
}

// ─── At-Risk Students ────────────────────────────────────────────────────────

/** GET /api/dashboard/at-risk — find students with low attendance/study/gpa */
async function apiAtRiskStudents(req, res) {
  const thresholds = {
    attendance: parseInt(req.query.attendance, 10) || 75,
    studyHours: parseFloat(req.query.study) || 2,
    gpa: parseFloat(req.query.gpa) || 2.5,
  };

  try {
    const result = await studentService.getAtRiskStudents(thresholds);
    res.json(result);
  } catch (err) {
    console.error('[apiAtRiskStudents]', err);
    res.status(500).json({ error: 'Failed to load at-risk students.' });
  }
}

// ─── AI Feedback ───────────────────────────────────────────────────────────────

/** POST /api/feedback — run ML prediction + generate rule-based feedback */
async function apiFeedback(req, res) {
  const input = req.body || {};

  // Validate required fields
  const requiredFields = ['gender', 'age', 'study_hours_per_day', 'attendance_percent',
                          'sleep_hours', 'previous_gpa', 'parental_education',
                          'internet_access', 'extracurricular', 'part_time_job'];
  const missing = requiredFields.filter(f => input[f] === undefined || input[f] === null || input[f] === '');
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields',
      missing,
      required: requiredFields
    });
  }

  // Run ML inference
  const pythonInput = { ...input };
  for (const key of ['internet_access', 'extracurricular', 'part_time_job']) {
    if (typeof pythonInput[key] === 'string') {
      pythonInput[key] = pythonInput[key].toLowerCase() === 'yes' ? 1 : 0;
    }
  }

  const scriptPath = path.join(__dirname, '..', '..', 'ml', 'inference.py');

  const proc = execFile('py', [scriptPath, '--json', '-'], {
    maxBuffer: 1024 * 1024,
    timeout: 30000,
  });

  let stdout = '';
  let stderr = '';

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('[apiFeedback] Python error:', stderr);
      return res.status(500).json({ error: 'Prediction failed', details: stderr });
    }

    try {
      const prediction = JSON.parse(stdout.trim());

      // Generate rule-based feedback
      const feedback = generateFeedback(input, prediction);

      res.json({
        final_score: prediction.final_score,
        grade: prediction.grade,
        grade_confidence: prediction.grade_confidence,
        grade_probabilities: prediction.grade_probabilities,
        feedback,
      });
    } catch (parseErr) {
      console.error('[apiFeedback] Parse error:', parseErr);
      console.error('[apiFeedback] stdout:', stdout);
      res.status(500).json({ error: 'Failed to parse prediction result' });
    }
  });

  proc.on('error', (error) => {
    console.error('[apiFeedback] Process error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Prediction failed', details: error.message });
    }
  });

  proc.stdout.on('data', (data) => { stdout += data; });
  proc.stderr.on('data', (data) => { stderr += data; });

  proc.stdin.write(JSON.stringify(pythonInput));
  proc.stdin.end();
}

/** GET /api/admin/analytics — Admin dashboard analytics */
async function apiAdminAnalytics(req, res) {
  try {
    const analytics = await studentService.getAdminAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error('[apiAdminAnalytics]', err);
    res.status(500).json({ error: 'Failed to load admin analytics.' });
  }
}

/** GET /api/admin/students — Filtered student list with pagination */
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

/** POST /api/admin/students/bulk-export — Export filtered students as CSV */
async function apiAdminBulkExport(req, res) {
  const { ids = [], filters = {} } = req.body || {};

  try {
    const rows = await studentService.getStudentsForBulk({ ids, filters });

    // Generate CSV
    const { getDisplayColumns } = require('../utils/schemaMap');
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

/** POST /api/admin/students/bulk-ai-evaluate — Run AI evaluation on multiple students */
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

/** POST /api/admin/students/:id/intervention — Generate intervention note for a student */
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

/** POST /api/admin/students/:id/summarize-habits — Generate habit summary for notes */
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

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Validate student form data.
 * Returns array of error messages (empty if valid).
 */
function validateStudentData(data, columns) {
  const errors = [];
  for (const col of columns) {
    const val = data[col.name];
    if (!col.nullable && (val === undefined || val === null || val === '')) {
      errors.push(`"${col.displayLabel}" is required.`);
      continue;
    }
    if (val === undefined || val === null || val === '') continue;

    if (col.inferredType === 'int' || col.inferredType === 'bigint') {
      if (isNaN(parseInt(val, 10)) || !Number.isFinite(Number(val))) {
        errors.push(`"${col.displayLabel}" must be a number.`);
      }
    }
    if (col.inferredType === 'decimal') {
      if (isNaN(parseFloat(val)) || !Number.isFinite(Number(val))) {
        errors.push(`"${col.displayLabel}" must be a number.`);
      }
    }
    if (col.inferredType === 'text' || col.inferredType === 'label') {
      const maxLen = Math.max((col.stats?.maxLength || 0) * 3, 255);
      if (String(val).length > maxLen) {
        errors.push(`"${col.displayLabel}" is too long (max ${maxLen} characters).`);
      }
    }
    if (col.inferredType === 'date') {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        errors.push(`"${col.displayLabel}" must be a valid date.`);
      }
    }
  }
  return errors;
}

module.exports = {
  apiLogin,
  apiRegister,
  apiLogout,
  apiMe,
  apiDashboardStats,
  apiAtRiskStudents,
  apiFeedback,
  apiListStudents,
  apiGetStudent,
  apiCreateStudent,
  apiUpdateStudent,
  apiDeleteStudent,
  apiListUsers,
  apiDeleteUser,
  apiPredict,
  apiAdminAnalytics,
  apiAdminListStudents,
  apiAdminBulkExport,
  apiAdminBulkAiEvaluate,
  apiAdminGenerateIntervention,
  apiAdminSummarizeHabits,
};