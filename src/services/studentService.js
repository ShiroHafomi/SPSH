/**
 * Student Service — ALL SQL lives here.
 * Parameterized queries only. No raw SQL in controllers/routes.
 * Whitelist from columns.js protects identifiers (sort/search columns).
 */
const { pool } = require('../config/db');
const { validateSortColumn, validateSortDir, clampPagination, getSearchableColumns } = require('../utils/columns');
const { getChartConfig } = require('../utils/chartConfig');

const TABLE = process.env.DB_TABLE || 'students';

/**
 * List students with search, sort, pagination.
 * @param {Object} opts { q, sort, dir, page, size }
 * @returns {Promise<Array>} rows
 */
async function listStudents({ q = '', sort = 'id', dir = 'asc', page = 1, size = 20 } = {}) {
  const safeSort = validateSortColumn(sort);
  const safeDir = validateSortDir(dir);
  const { page: p, size: s, offset } = clampPagination(page, size);

  const searchable = getSearchableColumns();
  const whereClauses = [];
  const params = [];

  if (q && q.trim() && searchable.length > 0) {
    const searchTerm = `%${q.trim()}%`;
    const conditions = searchable.map(() => '`?` LIKE ?').join(' OR ');
    // We can't parameterize column names, so we use the whitelisted names directly
    // The columns in `conditions` are from the whitelist, so safe
    const condSql = searchable.map(col => `\`${col}\` LIKE ?`).join(' OR ');
    whereClauses.push(`(${condSql})`);
    // One param per searchable column
    searchable.forEach(() => params.push(searchTerm));
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // ORDER BY uses whitelisted column + enum direction (safe to interpolate)
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
 * Total count for pagination (respects search filter).
 */
async function countStudents({ q = '' } = {}) {
  const searchable = getSearchableColumns();
  const whereClauses = [];
  const params = [];

  if (q && q.trim() && searchable.length > 0) {
    const searchTerm = `%${q.trim()}%`;
    const condSql = searchable.map(col => `\`${col}\` LIKE ?`).join(' OR ');
    whereClauses.push(`(${condSql})`);
    searchable.forEach(() => params.push(searchTerm));
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
 * @param {Object} thresholds { attendance, study_hours, gpa }
 * @returns {Promise<Object>} { students, count, thresholds }
 */
async function getAtRiskStudents({ attendance = 75, studyHours = 2, gpa = 2.5 } = {}) {
  const { loadSchemaMap, getSchemaMap } = require('../utils/schemaMap');
  loadSchemaMap();
  const map = getSchemaMap();

  const conditions = [];
  const params = [];

  // Find matching columns by semantic tag or name pattern
  for (const [key, tag] of [
    ['attendance_percent', 'attendance'],
    ['study_hours_per_day', 'study_hours'],
    ['previous_gpa', 'gpa'],
  ]) {
    const col = map[key];
    if (col) {
      switch (col.semanticTag || key) {
        case 'attendance':
        case 'attendance_percent':
          conditions.push(`\`${col.name}\` < ?`);
          params.push(thresholds.attendance);
          break;
        case 'study_hours':
        case 'study_hours_per_day':
          conditions.push(`\`${col.name}\` < ?`);
          params.push(thresholds.studyHours);
          break;
        case 'gpa':
        case 'previous_gpa':
          conditions.push(`\`${col.name}\` < ?`);
          params.push(thresholds.gpa);
          break;
        default:
          // Fallback: match by name containing keywords
          if (/attendance/i.test(col.name)) {
            conditions.push(`\`${col.name}\` < ?`);
            params.push(thresholds.attendance);
          } else if (/study.*hour/i.test(col.name)) {
            conditions.push(`\`${col.name}\` < ?`);
            params.push(thresholds.studyHours);
          } else if (/gpa/i.test(col.name)) {
            conditions.push(`\`${col.name}\` < ?`);
            params.push(thresholds.gpa);
          }
      }
    }
  }

  if (!conditions.length) {
    return { students: [], count: 0, thresholds: { attendance: thresholds.attendance, studyHours: thresholds.studyHours, gpa: thresholds.gpa } };
  }

  const whereSql = conditions.join(' OR ');
  const sql = `SELECT * FROM \`${TABLE}\` WHERE ${whereSql} ORDER BY \`id\` ASC LIMIT 20`;
  const [rows] = await pool.query(sql, params);

  return {
    students: rows,
    count: rows.length,
    thresholds: { attendance: thresholds.attendance, studyHours: thresholds.studyHours, gpa: thresholds.gpa },
  };
}

module.exports = {
  listStudents,
  countStudents,
  findById,
  createStudent,
  updateStudent,
  deleteStudent,
  getDashboardStats,
  getAtRiskStudents,
};