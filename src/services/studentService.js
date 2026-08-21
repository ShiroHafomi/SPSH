/**
 * Student Service — ALL SQL lives here.
 * Parameterized queries only. No raw SQL in controllers/routes.
 * Whitelist from columns.js protects identifiers (sort/search columns).
 */
const { pool } = require('../config/db');
const { validateSortColumn, validateSortDir, clampPagination, getSearchableColumns } = require('../utils/columns');
const { getChartConfig } = require('../utils/chartConfig');
const mlService = require('./mlService');
const { generateInterventionNote: aiGenerateInterventionNote } = require('./aiCounselService');

const TABLE = process.env.DB_TABLE || 'students';

/**
 * List students with search, sort, pagination, and multiple filters.
 * @param {Object} opts { q, sort, dir, page, size, filters }
 *   filters: { grade, gender, part_time_job, parental_education, at_risk }
 * @returns {Promise<Array>} rows
 */
async function listStudents({ q = '', sort = 'id', dir = 'asc', page = 1, size = 20, filters = {} } = {}) {
  const safeSort = validateSortColumn(sort);
  const safeDir = validateSortDir(dir);
  const { page: p, size: s, offset } = clampPagination(page, size);

  const searchable = getSearchableColumns();
  const whereClauses = [];
  const params = [];

  // Global search
  if (q && q.trim() && searchable.length > 0) {
    const searchTerm = `%${q.trim()}%`;
    const condSql = searchable.map(col => `\`${col}\` LIKE ?`).join(' OR ');
    whereClauses.push(`(${condSql})`);
    searchable.forEach(() => params.push(searchTerm));
  }

  // Filters
  if (filters.grade && filters.grade !== 'all') {
    whereClauses.push('`grade` = ?');
    params.push(filters.grade);
  }
  if (filters.gender && filters.gender !== 'all') {
    whereClauses.push('`gender` = ?');
    params.push(filters.gender);
  }
  if (filters.part_time_job && filters.part_time_job !== 'all') {
    whereClauses.push('`part_time_job` = ?');
    params.push(filters.part_time_job);
  }
  if (filters.parental_education && filters.parental_education !== 'all') {
    whereClauses.push('`parental_education` = ?');
    params.push(filters.parental_education);
  }
  if (filters.at_risk && filters.at_risk !== 'all') {
    // At-risk filter uses the same logic as getAtRiskStudents
    const { loadSchemaMap, getSchemaMap, getColumnByName } = require('../utils/schemaMap');
    loadSchemaMap();
    const map = getSchemaMap();
    const atRiskConditions = [];
    const atRiskParams = [];

    for (const [key, tag] of [
      ['attendance_percent', 'attendance'],
      ['study_hours_per_day', 'study_hours'],
      ['previous_gpa', 'gpa'],
    ]) {
      const col = getColumnByName(key);
      if (col) {
        switch (col.semantic || key) {
          case 'attendance':
          case 'attendance_percent':
            atRiskConditions.push(`\`${col.name}\` < ?`);
            atRiskParams.push(75);
            break;
          case 'study_hours':
          case 'study_hours_per_day':
            atRiskConditions.push(`\`${col.name}\` < ?`);
            atRiskParams.push(2);
            break;
          case 'gpa':
          case 'previous_gpa':
            atRiskConditions.push(`\`${col.name}\` < ?`);
            atRiskParams.push(2.0);
            break;
          default:
            if (/attendance/i.test(col.name)) {
              atRiskConditions.push(`\`${col.name}\` < ?`);
              atRiskParams.push(75);
            } else if (/study.*hour/i.test(col.name)) {
              atRiskConditions.push(`\`${col.name}\` < ?`);
              atRiskParams.push(2);
            } else if (/gpa/i.test(col.name)) {
              atRiskConditions.push(`\`${col.name}\` < ?`);
              atRiskParams.push(2.0);
            }
        }
      }
    }

    if (atRiskConditions.length) {
      whereClauses.push(`(${atRiskConditions.join(' OR ')})`);
      params.push(...atRiskParams);
    }
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT * FROM \`${TABLE}\`
    ${whereSql}
    ORDER BY \`${safeSort}\` ${safeDir}
    LIMIT ? OFFSET ?
  `;
  params.push(s, offset);

  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Total count for pagination (respects search filter and all filters).
 */
async function countStudents({ q = '', filters = {} } = {}) {
  const searchable = getSearchableColumns();
  const whereClauses = [];
  const params = [];

  if (q && q.trim() && searchable.length > 0) {
    const searchTerm = `%${q.trim()}%`;
    const condSql = searchable.map(col => `\`${col}\` LIKE ?`).join(' OR ');
    whereClauses.push(`(${condSql})`);
    searchable.forEach(() => params.push(searchTerm));
  }

  if (filters.grade && filters.grade !== 'all') {
    whereClauses.push('`grade` = ?');
    params.push(filters.grade);
  }
  if (filters.gender && filters.gender !== 'all') {
    whereClauses.push('`gender` = ?');
    params.push(filters.gender);
  }
  if (filters.part_time_job && filters.part_time_job !== 'all') {
    whereClauses.push('`part_time_job` = ?');
    params.push(filters.part_time_job);
  }
  if (filters.parental_education && filters.parental_education !== 'all') {
    whereClauses.push('`parental_education` = ?');
    params.push(filters.parental_education);
  }
  if (filters.at_risk && filters.at_risk !== 'all') {
    const { loadSchemaMap, getSchemaMap, getColumnByName } = require('../utils/schemaMap');
    loadSchemaMap();
    const map = getSchemaMap();
    const atRiskConditions = [];
    const atRiskParams = [];

    for (const [key, tag] of [
      ['attendance_percent', 'attendance'],
      ['study_hours_per_day', 'study_hours'],
      ['previous_gpa', 'gpa'],
    ]) {
      const col = getColumnByName(key);
      if (col) {
        switch (col.semantic || key) {
          case 'attendance':
          case 'attendance_percent':
            atRiskConditions.push(`\`${col.name}\` < ?`);
            atRiskParams.push(75);
            break;
          case 'study_hours':
          case 'study_hours_per_day':
            atRiskConditions.push(`\`${col.name}\` < ?`);
            atRiskParams.push(2);
            break;
          case 'gpa':
          case 'previous_gpa':
            atRiskConditions.push(`\`${col.name}\` < ?`);
            atRiskParams.push(2.0);
            break;
          default:
            if (/attendance/i.test(col.name)) {
              atRiskConditions.push(`\`${col.name}\` < ?`);
              atRiskParams.push(75);
            } else if (/study.*hour/i.test(col.name)) {
              atRiskConditions.push(`\`${col.name}\` < ?`);
              atRiskParams.push(2);
            } else if (/gpa/i.test(col.name)) {
              atRiskConditions.push(`\`${col.name}\` < ?`);
              atRiskParams.push(2.0);
            }
        }
      }
    }

    if (atRiskConditions.length) {
      whereClauses.push(`(${atRiskConditions.join(' OR ')})`);
      params.push(...atRiskParams);
    }
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sql = `SELECT COUNT(*) AS cnt FROM \`${TABLE}\` ${whereSql}`;

  const [rows] = await pool.query(sql, params);
  return rows[0]?.cnt || 0;
}

/** Find a single student by surrogate id. */
async function findById(id) {
  const sql = `SELECT * FROM \`${TABLE}\` WHERE \`id\` = ?`;
  const [rows] = await pool.query(sql, [id]);
  return rows[0] || null;
}

/**
 * Create a new student.
 * @param {Object} data - keyed by sanitized column names (from schema_map)
 * @returns {Promise<number>} inserted id
 */
async function createStudent(data) {
  const { getDisplayColumns } = require('../utils/schemaMap');
  const displayCols = getDisplayColumns(); // excludes id, created_at, updated_at

  const cols = [];
  const vals = [];
  const placeholders = [];

  for (const col of displayCols) {
    if (data[col.name] !== undefined && data[col.name] !== '') {
      cols.push(`\`${col.name}\``);
      vals.push(coerceValue(data[col.name], col.inferredType));
      placeholders.push('?');
    }
  }

  if (!cols.length) throw new Error('No valid columns to insert');

  const sql = `INSERT INTO \`${TABLE}\` (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
  const [result] = await pool.query(sql, vals);
  return result.insertId;
}

/**
 * Update a student by id.
 * @param {number} id
 * @param {Object} data - keyed by sanitized column names
 * @returns {Promise<boolean>} true if row was updated
 */
async function updateStudent(id, data) {
  const { getDisplayColumns } = require('../utils/schemaMap');
  const displayCols = getDisplayColumns();

  const sets = [];
  const vals = [];

  for (const col of displayCols) {
    if (data[col.name] !== undefined) {
      sets.push(`\`${col.name}\` = ?`);
      vals.push(coerceValue(data[col.name], col.inferredType));
    }
  }

  if (!sets.length) return false;

  vals.push(id);
  const sql = `UPDATE \`${TABLE}\` SET ${sets.join(', ')} WHERE \`id\` = ?`;
  const [result] = await pool.query(sql, vals);
  return result.affectedRows > 0;
}

/** Delete a student by id. */
async function deleteStudent(id) {
  const sql = `DELETE FROM \`${TABLE}\` WHERE \`id\` = ?`;
  const [result] = await pool.query(sql, [id]);
  return result.affectedRows > 0;
}

/**
 * Coerce a form value to the appropriate JS type for MySQL binding.
 */
function coerceValue(val, inferredType) {
  if (val === '' || val === null || val === undefined) return null;

  switch (inferredType) {
    case 'int':
    case 'bigint': {
      const n = parseInt(val, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'decimal': {
      const n = parseFloat(val);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      // Form sends 'on' for checkbox, or '1'/'0', 'true'/'false'
      const s = String(val).toLowerCase();
      if (['1', 'true', 'on', 'yes', 'y'].includes(s)) return 1;
      if (['0', 'false', 'off', 'no', 'n'].includes(s)) return 0;
      return null;
    }
    case 'date': {
      // Expect YYYY-MM-DD
      return val || null;
    }
    case 'datetime': {
      // Expect YYYY-MM-DD HH:MM:SS
      return val || null;
    }
    default:
      return String(val);
  }
}

/**
 * Aggregated stats for dashboard KPIs & charts.
 * Uses chartConfig to determine which columns to aggregate.
 */
async function getDashboardStats() {
  const chartConfig = getChartConfig();
  const stats = { totalStudents: 0 };

  // Total students
  const [totalRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM \`${TABLE}\``);
  stats.totalStudents = totalRows[0]?.cnt || 0;

  // KPI averages
  for (const kpi of chartConfig.kpis) {
    if (kpi.column) {
      const sql = `SELECT AVG(\`${kpi.column}\`) AS val FROM \`${TABLE}\` WHERE \`${kpi.column}\` IS NOT NULL`;
      const [rows] = await pool.query(sql);
      const val = rows[0]?.val;
      stats[kpi.column] = val != null ? Number(val) : null;
    }
  }

  // Bar chart data: avg(score) grouped by gender/category
  if (chartConfig.charts.length) {
    const bar = chartConfig.charts.find(c => c.type === 'bar');
    if (bar) {
      const sql = `
        SELECT \`${bar.xColumn}\` AS \`label\`, AVG(\`${bar.yColumn}\`) AS \`value\`
        FROM \`${TABLE}\`
        WHERE \`${bar.yColumn}\` IS NOT NULL AND \`${bar.xColumn}\` IS NOT NULL
        GROUP BY \`${bar.xColumn}\`
        ORDER BY \`value\` DESC
      `;
      const [rows] = await pool.query(sql);
      stats.barChart = rows.map(r => ({
        label: r.label,
        value: r.value != null ? Number(r.value) : 0,
      }));
    }

    // Scatter chart data
    const scatter = chartConfig.charts.find(c => c.type === 'scatter');
    if (scatter) {
      const sql = `
        SELECT \`${scatter.xColumn}\` AS x, \`${scatter.yColumn}\` AS y
        FROM \`${TABLE}\`
        WHERE \`${scatter.xColumn}\` IS NOT NULL AND \`${scatter.yColumn}\` IS NOT NULL
      `;
      const [rows] = await pool.query(sql);
      stats.scatterChart = rows.map(r => ({
        x: r.x != null ? Number(r.x) : 0,
        y: r.y != null ? Number(r.y) : 0,
      }));
    }

    // Histogram data (10 bins)
    const hist = chartConfig.charts.find(c => c.type === 'histogram');
    if (hist) {
      // Use CASE WHEN for binning
      const [minMax] = await pool.query(`
        SELECT MIN(\`${hist.column}\`) AS minv, MAX(\`${hist.column}\`) AS maxv
        FROM \`${TABLE}\` WHERE \`${hist.column}\` IS NOT NULL
      `);
      const minv = minMax[0]?.minv;
      const maxv = minMax[0]?.maxv;

      if (minv != null && maxv != null && maxv > minv) {
        const binCount = 10;
        const binSize = (maxv - minv) / binCount;
        const caseWhen = [];
        for (let i = 0; i < binCount; i++) {
          const lo = minv + i * binSize;
          const hi = minv + (i + 1) * binSize;
          caseWhen.push(`WHEN \`${hist.column}\` >= ${lo} AND \`${hist.column}\` < ${hi} THEN ${i}`);
        }
        // Last bin includes max
        caseWhen[binCount - 1] = caseWhen[binCount - 1].replace(`< ${maxv}`, `<= ${maxv}`);

        const sql = `
          SELECT \`bin\`, COUNT(*) AS \`count\`
          FROM (
            SELECT \`${hist.column}\`,
              CASE ${caseWhen.join(' ')} ELSE ${binCount - 1} END AS \`bin\`
            FROM \`${TABLE}\`
            WHERE \`${hist.column}\` IS NOT NULL
          ) t
          GROUP BY \`bin\`
          ORDER BY \`bin\`
        `;
        const [rows] = await pool.query(sql);
        stats.histogramChart = rows.map(r => ({
          bin: r.bin,
          count: r.count,
          // Add label for axis
          label: `${(minv + r.bin * binSize).toFixed(1)}–${(minv + (r.bin + 1) * binSize).toFixed(1)}`,
        }));
      }
    }
  }

  return stats;
}

/**
 * Find at-risk students based on configurable thresholds.
 * Detected via schema_agnostic column name heuristics.
 * @param {Object} thresholds { attendance, studyHours, gpa }
 * @returns {Promise<Object>} { students, count, thresholds }
 */
async function getAtRiskStudents({ attendance = 75, studyHours = 2, gpa = 2.5 } = {}) {
  const { loadSchemaMap, getColumnByName } = require('../utils/schemaMap');
  loadSchemaMap();

  const conditions = [];
  const params = [];

  // Find matching columns by semantic tag or name pattern
  for (const [key, tag] of [
    ['attendance_percent', 'attendance'],
    ['study_hours_per_day', 'study_hours'],
    ['previous_gpa', 'gpa'],
  ]) {
    const col = getColumnByName(key);
    if (col) {
      switch (col.semantic || key) {
        case 'attendance':
        case 'attendance_percent':
          conditions.push(`\`${col.name}\` < ?`);
          params.push(attendance);
          break;
        case 'study_hours':
        case 'study_hours_per_day':
          conditions.push(`\`${col.name}\` < ?`);
          params.push(studyHours);
          break;
        case 'gpa':
        case 'previous_gpa':
          conditions.push(`\`${col.name}\` < ?`);
          params.push(gpa);
          break;
        default:
          // Fallback: match by name containing keywords
          if (/attendance/i.test(col.name)) {
            conditions.push(`\`${col.name}\` < ?`);
            params.push(attendance);
          } else if (/study.*hour/i.test(col.name)) {
            conditions.push(`\`${col.name}\` < ?`);
            params.push(studyHours);
          } else if (/gpa/i.test(col.name)) {
            conditions.push(`\`${col.name}\` < ?`);
            params.push(gpa);
          }
      }
    }
  }

  if (!conditions.length) {
    return { students: [], count: 0, thresholds: { attendance, studyHours, gpa } };
  }

  const whereSql = conditions.join(' OR ');
  const sql = `SELECT * FROM \`${TABLE}\` WHERE ${whereSql} ORDER BY \`id\` ASC LIMIT 20`;
  const [rows] = await pool.query(sql, params);

  return {
    students: rows,
    count: rows.length,
    thresholds: { attendance, studyHours, gpa },
  };
}

/**
 * Get admin analytics summary with KPIs and chart data.
 * @returns {Promise<Object>} Analytics data for admin dashboard
 */
async function getAdminAnalytics() {
  const { loadSchemaMap, getSchemaMap, getDisplayColumns, getSemanticOrFirstNumeric } = require('../utils/schemaMap');
  loadSchemaMap();
  const map = getSchemaMap();
  const displayCols = getDisplayColumns();

  // Helper to find column by semantic tag
  const findCol = (semanticTags) => {
    if (!Array.isArray(semanticTags)) semanticTags = [semanticTags];
    for (const tag of semanticTags) {
      for (const col of displayCols) {
        if (col.semanticTag === tag || col.name === tag) return col.name;
      }
    }
    return null;
  };

  const colStudentId = findCol(['student_id', 'id']) || 'student_id';
  const colGrade = findCol(['grade', 'final_grade']) || 'grade';
  const colFinalScore = findCol(['final_score', 'score']) || 'final_score';
  const colGpa = findCol(['previous_gpa', 'gpa']) || 'previous_gpa';
  const colAttendance = findCol(['attendance_percent', 'attendance']) || 'attendance_percent';
  const colSleep = findCol(['sleep_hours', 'sleep']) || 'sleep_hours';
  const colStudyHours = findCol(['study_hours_per_day', 'study_hours']) || 'study_hours_per_day';
  const colPartTimeJob = findCol(['part_time_job', 'job']) || 'part_time_job';
  const colGender = findCol(['gender']) || 'gender';
  const colParentalEdu = findCol(['parental_education', 'parental']) || 'parental_education';

  // 1. Total Students
  const [totalRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM \`${TABLE}\``);
  const totalStudents = totalRows[0]?.cnt || 0;

  // 2. Average GPA
  const [avgGpaRows] = await pool.query(`SELECT AVG(\`${colGpa}\`) AS val FROM \`${TABLE}\` WHERE \`${colGpa}\` IS NOT NULL`);
  const avgGpa = avgGpaRows[0]?.val != null ? Number(avgGpaRows[0].val) : 0;

  // 3. Pass Rate (Grade A, B, C)
  const [passRows] = await pool.query(`
    SELECT
      SUM(CASE WHEN UPPER(\`${colGrade}\`) IN ('A','B','C') THEN 1 ELSE 0 END) AS passCount,
      COUNT(*) AS totalCount
    FROM \`${TABLE}\`
    WHERE \`${colGrade}\` IS NOT NULL
  `);
  const passRate = passRows[0]?.totalCount > 0
    ? (passRows[0].passCount / passRows[0].totalCount) * 100
    : 0;

  // 4. At-Risk Count (using default thresholds)
  const atRiskResult = await getAtRiskStudents({ attendance: 75, studyHours: 2, gpa: 2.0 });
  const atRiskCount = atRiskResult.count;

  // 5. Grade Distribution (Pie chart data)
  const [gradeDistRows] = await pool.query(`
    SELECT UPPER(\`${colGrade}\`) AS grade, COUNT(*) AS count
    FROM \`${TABLE}\`
    WHERE \`${colGrade}\` IS NOT NULL
    GROUP BY grade
    ORDER BY
      CASE grade
        WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3
        WHEN 'D' THEN 4 WHEN 'F' THEN 5 ELSE 6 END
  `);
  const gradeDistribution = gradeDistRows.map(r => ({
    grade: r.grade,
    count: Number(r.count),
  }));

  // 6. Attendance vs Final Score (Scatter plot data)
  let attendanceVsScore = [];
  if (colAttendance && colFinalScore) {
    const [scatterRows] = await pool.query(`
      SELECT \`${colAttendance}\` AS x, \`${colFinalScore}\` AS y
      FROM \`${TABLE}\`
      WHERE \`${colAttendance}\` IS NOT NULL AND \`${colFinalScore}\` IS NOT NULL
    `);
    attendanceVsScore = scatterRows.map(r => ({
      x: Number(r.x),
      y: Number(r.y),
    }));
  }

  // 7. Part-Time Job Impact (Bar chart: avg final_score by job status)
  let partTimeJobImpact = [];
  if (colPartTimeJob && colFinalScore) {
    const [jobRows] = await pool.query(`
      SELECT \`${colPartTimeJob}\` AS category, AVG(\`${colFinalScore}\`) AS avg_score, COUNT(*) AS count
      FROM \`${TABLE}\`
      WHERE \`${colPartTimeJob}\` IS NOT NULL AND \`${colFinalScore}\` IS NOT NULL
      GROUP BY \`${colPartTimeJob}\`
    `);
    partTimeJobImpact = jobRows.map(r => ({
      category: String(r.category),
      avgScore: Number(r.avg_score),
      count: Number(r.count),
    }));
  }

  // 8. Sleep Hours Impact (Bar chart: avg final_score by sleep buckets)
  let sleepImpact = [];
  if (colSleep && colFinalScore) {
    const [sleepRows] = await pool.query(`
      SELECT
        CASE
          WHEN \`${colSleep}\` < 5 THEN '0-4h'
          WHEN \`${colSleep}\` < 6 THEN '5h'
          WHEN \`${colSleep}\` < 7 THEN '6h'
          WHEN \`${colSleep}\` < 8 THEN '7h'
          WHEN \`${colSleep}\` < 9 THEN '8h'
          ELSE '9h+'
        END AS sleep_bucket,
        AVG(\`${colFinalScore}\`) AS avg_score,
        COUNT(*) AS count
      FROM \`${TABLE}\`
      WHERE \`${colSleep}\` IS NOT NULL AND \`${colFinalScore}\` IS NOT NULL
      GROUP BY sleep_bucket
      ORDER BY
        CASE sleep_bucket
          WHEN '0-4h' THEN 1 WHEN '5h' THEN 2 WHEN '6h' THEN 3
          WHEN '7h' THEN 4 WHEN '8h' THEN 5 WHEN '9h+' THEN 6 END
    `);
    sleepImpact = sleepRows.map(r => ({
      sleepBucket: String(r.sleep_bucket),
      avgScore: Number(r.avg_score),
      count: Number(r.count),
    }));
  }

  // 9. Gender distribution
  let genderDistribution = [];
  if (colGender) {
    const [genderRows] = await pool.query(`
      SELECT \`${colGender}\` AS gender, COUNT(*) AS count
      FROM \`${TABLE}\`
      WHERE \`${colGender}\` IS NOT NULL
      GROUP BY \`${colGender}\`
    `);
    genderDistribution = genderRows.map(r => ({
      gender: String(r.gender),
      count: Number(r.count),
    }));
  }

  // 10. Parental education distribution
  let parentalEduDistribution = [];
  if (colParentalEdu) {
    const [eduRows] = await pool.query(`
      SELECT \`${colParentalEdu}\` AS education, COUNT(*) AS count
      FROM \`${TABLE}\`
      WHERE \`${colParentalEdu}\` IS NOT NULL
      GROUP BY \`${colParentalEdu}\`
    `);
    parentalEduDistribution = eduRows.map(r => ({
      education: String(r.education),
      count: Number(r.count),
    }));
  }

  return {
    kpis: {
      totalStudents,
      avgGpa: Number(avgGpa.toFixed(2)),
      passRate: Number(passRate.toFixed(1)),
      atRiskCount,
    },
    charts: {
      gradeDistribution,
      attendanceVsScore,
      partTimeJobImpact,
      sleepImpact,
      genderDistribution,
      parentalEduDistribution,
    },
    // Filter options for dropdowns
    filterOptions: {
      grades: gradeDistribution.map(g => g.grade).filter(g => g),
      genders: genderDistribution.map(g => g.gender).filter(g => g),
      partTimeJobs: partTimeJobImpact.map(j => j.category).filter(j => j),
      parentalEducation: parentalEduDistribution.map(e => e.education).filter(e => e),
    },
  };
}

/**
 * Get students for bulk operations (export, bulk AI evaluate).
 * @param {Object} opts { ids?: number[], filters?: Object, page?, size? }
 * @returns {Promise<Array>} Student rows
 */
async function getStudentsForBulk({ ids = [], filters = {}, page = 1, size = 1000 } = {}) {
  const { validateSortColumn, validateSortDir, clampPagination, getSearchableColumns } = require('../utils/columns');
  const { loadSchemaMap, getSchemaMap } = require('../utils/schemaMap');

  let whereClauses = [];
  let params = [];

  // If specific IDs provided
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    whereClauses.push(`\`id\` IN (${placeholders})`);
    params.push(...ids);
  }

  // Apply filters (same logic as listStudents)
  const searchable = getSearchableColumns();
  if (filters.q && filters.q.trim() && searchable.length > 0) {
    const searchTerm = `%${filters.q.trim()}%`;
    const condSql = searchable.map(col => `\`${col}\` LIKE ?`).join(' OR ');
    whereClauses.push(`(${condSql})`);
    searchable.forEach(() => params.push(searchTerm));
  }
  if (filters.grade && filters.grade !== 'all') {
    whereClauses.push('`grade` = ?');
    params.push(filters.grade);
  }
  if (filters.gender && filters.gender !== 'all') {
    whereClauses.push('`gender` = ?');
    params.push(filters.gender);
  }
  if (filters.part_time_job && filters.part_time_job !== 'all') {
    whereClauses.push('`part_time_job` = ?');
    params.push(filters.part_time_job);
  }
  if (filters.parental_education && filters.parental_education !== 'all') {
    whereClauses.push('`parental_education` = ?');
    params.push(filters.parental_education);
  }
  if (filters.at_risk && filters.at_risk !== 'all') {
    loadSchemaMap();
    const { getColumnByName } = require('../utils/schemaMap');
    const atRiskConditions = [];
    for (const [key] of [
      ['attendance_percent', 'attendance'],
      ['study_hours_per_day', 'study_hours'],
      ['previous_gpa', 'gpa'],
    ]) {
      const col = getColumnByName(key);
      if (col) {
        if (/attendance/i.test(col.name)) atRiskConditions.push(`\`${col.name}\` < ?`);
        else if (/study.*hour/i.test(col.name)) atRiskConditions.push(`\`${col.name}\` < ?`);
        else if (/gpa/i.test(col.name)) atRiskConditions.push(`\`${col.name}\` < ?`);
      }
    }
    if (atRiskConditions.length) {
      whereClauses.push(`(${atRiskConditions.join(' OR ')})`);
      // Add parameters for the thresholds (same order as conditions)
      for (const [k] of [
        ['attendance_percent', 'attendance'],
        ['study_hours_per_day', 'study_hours'],
        ['previous_gpa', 'gpa'],
      ]) {
        const c = getColumnByName(k);
        if (c) {
          if (/attendance/i.test(c.name)) params.push(75);
          else if (/study.*hour/i.test(c.name)) params.push(2);
          else if (/gpa/i.test(c.name)) params.push(2.0);
        }
      }
    }
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const { page: p, size: s, offset } = clampPagination(page, size);
  const sql = `SELECT * FROM \`${TABLE}\` ${whereSql} ORDER BY \`id\` ASC LIMIT ? OFFSET ?`;
  params.push(s, offset);

  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Generate AI intervention note for a specific student.
 * Uses centralized ML service and AI counsel service.
 * @param {number} studentId
 * @returns {Promise<Object>} { interventionNote: string, prediction, riskAssessment }
 */
async function generateInterventionNote(studentId) {
  const student = await findById(studentId);
  if (!student) throw new Error('Student not found');

  // Get prediction from centralized ML service
  let prediction;
  try {
    prediction = await mlService.predictForStudent(studentId);
  } catch (err) {
    if (err.message === 'ML capacity exceeded') {
      throw new Error('ML capacity exceeded');
    }
    throw err;
  }

  // Generate intervention note using AI counsel service (with pre-fetched prediction)
  const result = await aiGenerateInterventionNote(studentId, null, prediction);

  return result;
}

/**
 * Summarize student habits for notes field.
 * @param {number} studentId
 * @returns {Promise<Object>} { summary: string }
 */
async function summarizeHabits(studentId) {
  const student = await findById(studentId);
  if (!student) throw new Error('Student not found');

  const { loadSchemaMap, getSchemaMap, getDisplayColumns } = require('../utils/schemaMap');
  loadSchemaMap();
  const map = getSchemaMap();
  const displayCols = getDisplayColumns();

  const findCol = (semanticTags) => {
    if (!Array.isArray(semanticTags)) semanticTags = [semanticTags];
    for (const tag of semanticTags) {
      for (const col of displayCols) {
        if (col.semanticTag === tag || col.name === tag) return col.name;
      }
    }
    return null;
  };

  const colGrade = findCol(['grade', 'final_grade']) || 'grade';
  const colFinalScore = findCol(['final_score', 'score']) || 'final_score';
  const colGpa = findCol(['previous_gpa', 'gpa']) || 'previous_gpa';
  const colAttendance = findCol(['attendance_percent', 'attendance']) || 'attendance_percent';
  const colSleep = findCol(['sleep_hours', 'sleep']) || 'sleep_hours';
  const colStudyHours = findCol(['study_hours_per_day', 'study_hours']) || 'study_hours_per_day';
  const colPartTimeJob = findCol(['part_time_job', 'job']) || 'part_time_job';
  const colGender = findCol(['gender']) || 'gender';
  const colParentalEdu = findCol(['parental_education', 'parental']) || 'parental_education';

  let summary = `Student Profile Summary (Auto-generated)\n`;
  summary += `Generated: ${new Date().toLocaleString()}\n\n`;
  summary += `Student ID: ${student.student_id || student.id}\n`;
  summary += `Gender: ${student[colGender] || 'N/A'}\n`;
  summary += `Age: ${student.age || 'N/A'}\n`;
  summary += `Grade: ${student[colGrade] || 'N/A'} (${student[colFinalScore] || 'N/A'}/100)\n`;
  summary += `Previous GPA: ${student[colGpa] || 'N/A'}\n\n`;
  summary += `Study Habits:\n`;
  summary += `  - Study Hours/Day: ${student[colStudyHours] || 'N/A'}\n`;
  summary += `  - Attendance: ${student[colAttendance] || 'N/A'}%\n`;
  summary += `  - Sleep Hours: ${student[colSleep] || 'N/A'}\n`;
  summary += `  - Part-Time Job: ${student[colPartTimeJob] || 'N/A'}\n`;
  summary += `  - Internet Access: ${student.internet_access || 'N/A'}\n`;
  summary += `  - Extracurricular: ${student.extracurricular || 'N/A'}\n\n`;
  summary += `Background:\n`;
  summary += `  - Parental Education: ${student[colParentalEdu] || 'N/A'}\n`;
  summary += `  - Special Notes: ${student.notes || 'None'}\n`;

  return { summary };
}

/**
 * Find student by student_id (display ID from CSV).
 */
async function findByStudentId(studentId) {
  const sql = `SELECT * FROM \`${TABLE}\` WHERE \`student_id\` = ?`;
  const [rows] = await pool.query(sql, [studentId]);
  return rows[0] || null;
}

/**
 * Get distinct values for a column (for filter dropdowns).
 */
async function getDistinctValues(column) {
  const allowedColumns = ['grade', 'gender', 'part_time_job', 'parental_education'];
  if (!allowedColumns.includes(column)) {
    throw new Error(`Column ${column} not allowed for distinct query`);
  }
  const sql = `SELECT DISTINCT \`${column}\` FROM \`${TABLE}\` WHERE \`${column}\` IS NOT NULL ORDER BY \`${column}\``;
  const [rows] = await pool.query(sql);
  return rows.map(r => r[column]).filter(v => v !== null && v !== '');
}

/**
 * Get student percentiles (class ranking for each metric).
 */
async function getStudentPercentiles(studentId) {
  const { loadSchemaMap, getSchemaMap, getDisplayColumns } = require('../utils/schemaMap');
  loadSchemaMap();
  const map = getSchemaMap();
  const displayCols = getDisplayColumns();

  const findCol = (semanticTags) => {
    if (!Array.isArray(semanticTags)) semanticTags = [semanticTags];
    for (const tag of semanticTags) {
      for (const col of displayCols) {
        if (col.semanticTag === tag || col.name === tag) return col.name;
      }
    }
    return null;
  };

  const colFinalScore = findCol(['final_score', 'score']) || 'final_score';
  const colGpa = findCol(['previous_gpa', 'gpa']) || 'previous_gpa';
  const colAttendance = findCol(['attendance_percent', 'attendance']) || 'attendance_percent';
  const colStudyHours = findCol(['study_hours_per_day', 'study_hours']) || 'study_hours_per_day';
  const colSleep = findCol(['sleep_hours', 'sleep']) || 'sleep_hours';

  // Get student's values
  const student = await findById(studentId);
  if (!student) return {};

  // Calculate percentile for each metric
  const metrics = [
    { key: 'finalScore', column: colFinalScore, studentVal: student[colFinalScore], higherIsBetter: true },
    { key: 'gpa', column: colGpa, studentVal: student[colGpa], higherIsBetter: true },
    { key: 'attendance', column: colAttendance, studentVal: student[colAttendance], higherIsBetter: true },
    { key: 'studyHours', column: colStudyHours, studentVal: student[colStudyHours], higherIsBetter: true },
    { key: 'sleep', column: colSleep, studentVal: student[colSleep], higherIsBetter: true },
  ];

  const percentiles = {};

  for (const metric of metrics) {
    if (metric.studentVal === null || metric.studentVal === undefined) {
      percentiles[metric.key] = null;
      continue;
    }

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM \`${TABLE}\` WHERE \`${metric.column}\` IS NOT NULL`
    );
    const total = rows[0]?.cnt || 1;

    const op = metric.higherIsBetter ? '<=' : '<';
    const [lessRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM \`${TABLE}\` WHERE \`${metric.column}\` IS NOT NULL AND \`${metric.column}\` ${op} ?`,
      [metric.studentVal]
    );
    const lessOrEqual = lessRows[0]?.cnt || 0;

    percentiles[metric.key] = Math.round((lessOrEqual / total) * 100);
  }

  return percentiles;
}

/**
 * Check personal risk alerts for a student.
 * Returns array of alert objects for the student portal banner.
 */
function checkPersonalRiskAlerts(student) {
  const alerts = [];
  const thresholds = {
    attendance: 75,
    studyHours: 2,
    gpa: 2.5,
    sleepHours: 5.5,
  };

  // Attendance
  if (student.attendance_percent !== null && student.attendance_percent < thresholds.attendance) {
    if (student.attendance_percent < 60) {
      alerts.push({
        type: 'danger',
        icon: 'AlertTriangle',
        title: 'Critical: Exam Ban Risk',
        message: `Tỷ lệ điểm danh ${student.attendance_percent}% - Nguy cơ bị cấm thi`,
      });
    } else {
      alerts.push({
        type: 'warning',
        icon: 'AlertTriangle',
        title: 'Low Attendance',
        message: `Tỷ lệ điểm danh ${student.attendance_percent}% - Dưới ngưỡng an toàn (${thresholds.attendance}%)`,
      });
    }
  }

  // Study hours
  if (student.study_hours_per_day !== null && student.study_hours_per_day < thresholds.studyHours) {
    alerts.push({
      type: 'warning',
      icon: 'BookOpen',
      title: 'Insufficient Study Time',
      message: `Chỉ học ${student.study_hours_per_day}h/ngày - Khuyến nghị ${thresholds.studyHours}+h để cải thiện kết quả`,
    });
  }

  // GPA
  if (student.previous_gpa !== null && student.previous_gpa < thresholds.gpa) {
    alerts.push({
      type: 'danger',
      icon: 'AlertTriangle',
      title: 'Low Academic Foundation',
      message: `GPA trước ${student.previous_gpa} - Dưới ngưỡng ${thresholds.gpa}, cần can thiệp gấp`,
    });
  }

  // Sleep
  if (student.sleep_hours !== null && student.sleep_hours < thresholds.sleepHours) {
    if (student.sleep_hours < 4) {
      alerts.push({
        type: 'danger',
        icon: 'Moon',
        title: 'Severe Sleep Deprivation',
        message: `Chỉ ngủ ${student.sleep_hours}h/đêm - Ảnh hưởng nghiêm trọng đến인지 và trí nhớ`,
      });
    } else {
      alerts.push({
        type: 'warning',
        icon: 'Moon',
        title: 'Insufficient Sleep',
        message: `Ngủ ${student.sleep_hours}h/đêm - Dưới khuyến nghị ${thresholds.sleepHours}h, ảnh hưởng tập trung`,
      });
    }
  }

  // Part-time job balance
  if (student.part_time_job && student.study_hours_per_day < 3) {
    alerts.push({
      type: 'info',
      icon: 'Briefcase',
      title: 'Work-Study Balance',
      message: 'Có làm thêm nhưng giờ học thấp - Cần lập lịch học tập chặt chẽ hơn',
    });
  }

  return alerts;
}

/**
 * Assess student risk with detailed breakdown (for teacher/detail view).
 */
async function assessStudentRisk(studentId) {
  const student = await findById(studentId);
  if (!student) return null;

  const alerts = checkPersonalRiskAlerts(student);

  // Determine overall risk level
  let riskLevel = 'low';
  const hasCritical = alerts.some(a => a.type === 'danger');
  const hasWarning = alerts.some(a => a.type === 'warning');

  if (hasCritical) riskLevel = 'high';
  else if (hasWarning) riskLevel = 'medium';

  return {
    riskLevel,
    alertCount: alerts.length,
    criticalCount: alerts.filter(a => a.type === 'danger').length,
    warningCount: alerts.filter(a => a.type === 'warning').length,
    alerts,
  };
}

/**
 * Get teacher analytics - extended version of admin analytics for teacher dashboard.
 */
async function getTeacherAnalytics() {
  // Reuse admin analytics but add teacher-specific computations
  const adminAnalytics = await getAdminAnalytics();

  // Add teacher-specific: class comparison, trend
  const { loadSchemaMap, getSchemaMap, getDisplayColumns } = require('../utils/schemaMap');
  loadSchemaMap();
  const map = getSchemaMap();
  const displayCols = getDisplayColumns();

  const findCol = (semanticTags) => {
    if (!Array.isArray(semanticTags)) semanticTags = [semanticTags];
    for (const tag of semanticTags) {
      for (const col of displayCols) {
        if (col.semanticTag === tag || col.name === tag) return col.name;
      }
    }
    return null;
  };

  const colFinalScore = findCol(['final_score', 'score']) || 'final_score';
  const colAttendance = findCol(['attendance_percent', 'attendance']) || 'attendance_percent';
  const colStudyHours = findCol(['study_hours_per_day', 'study_hours']) || 'study_hours_per_day';
  const colSleep = findCol(['sleep_hours', 'sleep']) || 'sleep_hours';
  const colGrade = findCol(['grade', 'final_grade']) || 'grade';

  // Grade distribution with percentages
  const gradeDist = adminAnalytics.charts.gradeDistribution;
  const totalStudents = adminAnalytics.kpis.totalStudents;
  const gradeDistributionWithPct = gradeDist.map(g => ({
    ...g,
    percentage: totalStudents > 0 ? Number(((g.count / totalStudents) * 100).toFixed(1)) : 0,
  }));

  // Habit correlation charts
  let studyHoursCorrelation = [];
  if (colStudyHours && colFinalScore) {
    const [rows] = await pool.query(`
      SELECT \`${colStudyHours}\` AS x, \`${colFinalScore}\` AS y
      FROM \`${TABLE}\`
      WHERE \`${colStudyHours}\` IS NOT NULL AND \`${colFinalScore}\` IS NOT NULL
    `);
    studyHoursCorrelation = rows.map(r => ({ x: Number(r.x), y: Number(r.y) }));
  }

  let sleepCorrelation = [];
  if (colSleep && colFinalScore) {
    const [rows] = await pool.query(`
      SELECT \`${colSleep}\` AS x, \`${colFinalScore}\` AS y
      FROM \`${TABLE}\`
      WHERE \`${colSleep}\` IS NOT NULL AND \`${colFinalScore}\` IS NOT NULL
    `);
    sleepCorrelation = rows.map(r => ({ x: Number(r.x), y: Number(r.y) }));
  }

  return {
    ...adminAnalytics,
    kpis: {
      ...adminAnalytics.kpis,
      gradeDistribution: gradeDistributionWithPct,
    },
    charts: {
      ...adminAnalytics.charts,
      studyHoursCorrelation,
      sleepCorrelation,
    },
  };
}

module.exports = {
  listStudents,
  countStudents,
  findById,
  findByStudentId,
  createStudent,
  updateStudent,
  deleteStudent,
  getDashboardStats,
  getAtRiskStudents,
  getAdminAnalytics,
  getTeacherAnalytics,
  getStudentsForBulk,
  generateInterventionNote,
  summarizeHabits,
  getDistinctValues,
  getStudentPercentiles,
  checkPersonalRiskAlerts,
  assessStudentRisk,
};