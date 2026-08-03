/**
 * Student Controller — handles CRUD for students table.
 */
const { listStudents, countStudents, findById, createStudent, updateStudent, deleteStudent } = require('../services/studentService');
const { getDisplayColumns, getSchemaMap, loadSchemaMap } = require('../utils/schemaMap');
const { buildColumnSets } = require('../utils/columns');

async function index(req, res) {
  const dbReady = req.app.locals.dbReady;
  if (!dbReady) {
    return res.render('error', {
      title: 'Data Not Imported',
      message: 'No student data found in the database.',
      details: 'Run the import command to load the dataset.',
      commands: ['npm run import:sample', 'npm run import -- --file <your.csv> --replace'],
      backLink: '/',
    });
  }

  // Ensure column sets are up to date (in case of re-import)
  buildColumnSets();
  loadSchemaMap();

  const q = req.query.q || '';
  const sort = req.query.sort || 'id';
  const dir = req.query.dir || 'asc';
  const page = parseInt(req.query.page, 10) || 1;
  const size = parseInt(req.query.size, 10) || 20;

  const [rows, total] = await Promise.all([
    listStudents({ q, sort, dir, page, size }),
    countStudents({ q }),
  ]);

  const totalPages = Math.ceil(total / size);
  const displayCols = getDisplayColumns();

  res.render('students/index', {
    title: 'Students',
    rows,
    columns: displayCols,
    q,
    sort,
    dir,
    page,
    size,
    total,
    totalPages,
    schemaMap: getSchemaMap(),
  });
}

async function newForm(req, res) {
  const dbReady = req.app.locals.dbReady;
  if (!dbReady) {
    return res.redirect('/?error=no-data');
  }

  loadSchemaMap();
  const displayCols = getDisplayColumns();

  res.render('students/form', {
    title: 'New Student',
    mode: 'create',
    student: null,
    columns: displayCols,
    schemaMap: getSchemaMap(),
    errors: null,
  });
}

async function create(req, res) {
  const displayCols = getDisplayColumns();

  // Build data object from form body
  const data = {};
  for (const col of displayCols) {
    const val = req.body[col.name];
    if (val !== undefined && val !== '') {
      data[col.name] = val;
    }
  }

  // Validate
  const validation = validateForm(data, displayCols);
  if (validation) {
    return res.status(400).render('students/form', {
      title: 'New Student',
      mode: 'create',
      student: req.body,
      columns: displayCols,
      schemaMap: getSchemaMap(),
      errors: { general: validation.errorSummary, fields: validation.errors },
    });
  }

  try {
    await createStudent(data);
    res.redirect('/students?created=1');
  } catch (err) {
    console.error('[create]', err);
    res.status(400).render('students/form', {
      title: 'New Student',
      mode: 'create',
      student: req.body,
      columns: displayCols,
      schemaMap: getSchemaMap(),
      errors: { general: err.message },
    });
  }
}

async function editForm(req, res) {
  const id = parseInt(req.params.id, 10);
  const student = await findById(id);

  if (!student) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: `Student with ID ${id} not found.`,
      backLink: '/students',
    });
  }

  const displayCols = getDisplayColumns();

  res.render('students/form', {
    title: 'Edit Student',
    mode: 'edit',
    student,
    columns: displayCols,
    schemaMap: getSchemaMap(),
    errors: null,
  });
}

async function update(req, res) {
  const id = parseInt(req.params.id, 10);
  const displayCols = getDisplayColumns();

  const data = {};
  for (const col of displayCols) {
    if (req.body[col.name] !== undefined) {
      data[col.name] = req.body[col.name];
    }
  }

  // Validate
  const validation = validateForm(data, displayCols);
  if (validation) {
    const student = await findById(id);
    return res.status(400).render('students/form', {
      title: 'Edit Student',
      mode: 'edit',
      student: { ...student, ...data },
      columns: displayCols,
      schemaMap: getSchemaMap(),
      errors: { general: validation.errorSummary, fields: validation.errors },
    });
  }

  try {
    await updateStudent(id, data);
    res.redirect('/students?updated=1');
  } catch (err) {
    console.error('[update]', err);
    const student = await findById(id);
    res.status(400).render('students/form', {
      title: 'Edit Student',
      mode: 'edit',
      student: { ...student, ...req.body },
      columns: displayCols,
      schemaMap: getSchemaMap(),
      errors: { general: err.message },
    });
  }
}

/**
 * Lightweight form validation.
 * Returns null if valid, or an object with `errors` array and optionally `errorSummary`.
 */
function validateForm(data, columns) {
  const errors = [];

  for (const col of columns) {
    const val = data[col.name];

    // Required field check (nullable = false means required)
    if (!col.nullable && (val === undefined || val === null || val === '')) {
      errors.push(`"${col.displayLabel}" is required.`);
      continue;
    }

    // Skip further checks for empty optional fields
    if (val === undefined || val === null || val === '') continue;

    // Numeric type validation
    if (col.inferredType === 'int' || col.inferredType === 'bigint') {
      if (isNaN(parseInt(val, 10)) || !Number.isFinite(Number(val))) {
        errors.push(`"${col.displayLabel}" must be a number.`);
      }
    }

    // Decimal validation
    if (col.inferredType === 'decimal') {
      if (isNaN(parseFloat(val)) || !Number.isFinite(Number(val))) {
        errors.push(`"${col.displayLabel}" must be a number.`);
      }
    }

    // Text max length (use the schema's maxLength * 1.5 as a safe limit)
if (col.inferredType === 'text' || col.inferredType === 'label') {
      const maxLen = Math.max((col.stats.maxLength || 0) * 3, 255);
      if (String(val).length > maxLen) {
        errors.push(`"${col.displayLabel}" is too long (max ${maxLen} characters).`);
      }
    }

    // Date validation
    if (col.inferredType === 'date') {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        errors.push(`"${col.displayLabel}" must be a valid date.`);
      }
    }
  }

  return errors.length > 0 ? { errors, errorSummary: errors[0] } : null;
}

async function remove(req, res) {
  const id = parseInt(req.params.id, 10);
  await deleteStudent(id);
  res.redirect('/students?deleted=1');
}

module.exports = { index, newForm, create, editForm, update, remove };