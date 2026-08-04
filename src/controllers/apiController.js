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

// ─── Auth ────────────────────────────────────────────────────────────────────

/** POST /api/auth/login */
async function apiLogin(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await authService.loginUser({ email, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    req.session.userId = user.id;
    res.json({ user });
  } catch (err) {
    console.error('[apiLogin]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

/** POST /api/auth/register */
async function apiRegister(req, res) {
  const { name, email, password, confirm_password } = req.body || {};
  const errors = [];

  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    errors.push('Name must be between 2 and 100 characters.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }
  if (password !== confirm_password) {
    errors.push('Passwords do not match.');
  }
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors });
  }

  try {
    const exists = await authService.emailExists(email);
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const user = await authService.registerUser({ email, password, name: name.trim() });
    req.session.userId = user.id;
    res.json({ user });
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
  apiListStudents,
  apiGetStudent,
  apiCreateStudent,
  apiUpdateStudent,
  apiDeleteStudent,
  apiListUsers,
  apiDeleteUser,
  apiPredict,
};