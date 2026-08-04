#!/usr/bin/env node
/**
 * CSV → MySQL importer with schema inference.
 * Two-pass design:
 *   Pass A (peek): read first N rows → sanitize headers → infer types
 *   Pass B (stream): re-read CSV in batches → parameterized INSERT → row-by-row fallback on error
 *
 * Usage:
 *   node src/scripts/import.js --file <csv> [--db student_performance] [--table students]
 *                              [--batch 1000] [--replace] [--sample 200] [--date-format auto]
 *
 * Outputs:
 *   - Creates DB + table in MySQL
 *   - Writes schema_map.json at repo root (contract for the web app)
 *   - Logs failures to import_errors.log
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { parse: parseSync } = require('csv-parse/sync');
const mysql = require('mysql2/promise');

// ──────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    file: null,
    db: 'student_performance',
    table: 'students',
    batch: 1000,
    sample: 200,
    replace: false,
    dateFormat: 'auto',   // auto|iso|us|dmy
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file' && i + 1 < args.length) opts.file = args[++i];
    else if (a === '--db' && i + 1 < args.length) opts.db = args[++i];
    else if (a === '--table' && i + 1 < args.length) opts.table = args[++i];
    else if (a === '--batch' && i + 1 < args.length) opts.batch = Number(args[++i]);
    else if (a === '--sample' && i + 1 < args.length) opts.sample = Number(args[++i]);
    else if (a === '--date-format' && i + 1 < args.length) opts.dateFormat = args[++i];
    else if (a === '--replace') opts.replace = true;
    else if (a === '-v' || a === '--verbose') opts.verbose = true;
  }

  if (!opts.file) {
    console.error('Error: --file <csvPath> is required');
    process.exit(1);
  }

  return opts;
}

const OPTS = parseArgs();

// ──────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────
const MYSQL_RESERVED = new Set([
  'order', 'group', 'select', 'index', 'key', 'table', 'default',
  'level', 'rank', 'row', 'user', 'lead', 'zone', 'desc', 'asc',
  'limit', 'offset', 'where', 'having', 'join', 'inner', 'outer',
  'left', 'right', 'union', 'distinct', 'exists', 'between',
  'case', 'when', 'then', 'else', 'end', 'and', 'or', 'not',
  'null', 'true', 'false', 'like', 'in', 'is', 'as', 'on',
  'natural', 'cross', 'full', 'primary', 'foreign', 'references',
  'check', 'constraint', 'unique', 'auto_increment', 'timestamp',
  'datetime', 'date', 'time', 'year', 'month', 'day', 'hour',
  'minute', 'second', 'interval', 'current_timestamp', 'now'
]);

const NULL_LIKE_RE = /^(?:n\/?a|null|nan|none|-|–|—|\s*)$/i;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_ISO_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DATE_US_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;   // MM/DD/YYYY
const DATE_DMY_RE = /^\d{1,2}-\d{1,2}-\d{4}$/;    // DD-MM-YYYY (also matches ISO if no time)
const BOOL_TRUE = new Set(['true', 'yes', 'y', 't', '1']);
const BOOL_FALSE = new Set(['false', 'no', 'n', 'f', '0']);
const BOOL_TOKENS = new Set([...BOOL_TRUE, ...BOOL_FALSE]);

const SEMANTIC_PATTERNS = [
  { key: 'studyHours', re: /study.*hour|hour.*stud|hours?\s*per\s*(day|week)|time.*stud|studytime/i },
  { key: 'score', re: /(^|_|\b)(final\s*)?score|grade|exam\s*score|test\s*score|performance|marks?(?:$|\b)/i },
  { key: 'attendance', re: /attend|present/i },
  { key: 'sleep', re: /sleep/i },
  { key: 'age', re: /(^|_)\bage\b/i },
  { key: 'gender', re: /gender|sex/i },
  { key: 'student_id', re: /student.*id|^id$/i },
  { key: 'level', re: /level|class|grade\s*level/i },
];

function log(...msgs) { if (OPTS.verbose) console.log('[import]', ...msgs); }

function sanitizeHeader(h) {
  let s = String(h).trim().toLowerCase();
  s = s.replace(/[^a-z0-9_]+/g, '_');
  s = s.replace(/^_+|_+$/g, '');
  s = s.replace(/_+/g, '_');
  if (!s) return null;
  // leading digit
  if (/^\d/.test(s)) s = `col_${s}`;
  // reserved word
  if (MYSQL_RESERVED.has(s)) s = `col_${s}`;
  return s;
}

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map(h => {
    if (!seen.has(h)) { seen.set(h, 1); return h; }
    const n = seen.get(h) + 1;
    seen.set(h, n);
    return `${h}_${n}`;
  });
}

function isNullLike(v) {
  return v == null || NULL_LIKE_RE.test(String(v).trim());
}

function parseNumber(v) {
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBool(v) {
  const s = String(v).trim().toLowerCase();
  if (BOOL_TRUE.has(s)) return 1;
  if (BOOL_FALSE.has(s)) return 0;
  return null;
}

// Try to parse date; return { type: 'date'|'datetime', value: 'YYYY-MM-DD'|'YYYY-MM-DD HH:MM:SS' } or null
function parseDateFlex(v, fmt) {
  const s = String(v).trim();
  if (!s) return null;
  // ISO date
  if (DATE_ISO_RE.test(s)) return { type: 'date', value: s };
  // ISO datetime
  if (DATE_TIME_ISO_RE.test(s)) {
    // normalize to MySQL DATETIME format
    const dt = s.replace('T', ' ').replace('Z', '');
    const main = dt.split('.')[0];
    return { type: 'datetime', value: main };
  }
  // US MM/DD/YYYY
  if (fmt === 'us' || (fmt === 'auto' && DATE_US_RE.test(s))) {
    const [mm, dd, yyyy] = s.split('/');
    return { type: 'date', value: `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` };
  }
  // DMY DD-MM-YYYY (but not ISO which has 4-digit year first)
  if (fmt === 'dmy' || (fmt === 'auto' && DATE_DMY_RE.test(s) && !DATE_ISO_RE.test(s))) {
    const parts = s.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      const [dd, mm, yyyy] = parts;
      return { type: 'date', value: `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` };
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Pass A: Type inference peek
// ──────────────────────────────────────────────────────────────
async function inferSchema(csvPath) {
  log('Pass A: inferring schema from', csvPath);

  // Read first pass (sync, small sample)
  const content = fs.readFileSync(csvPath, 'utf8');
  const records = parseSync(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    quote: '"',
    escape: '"',
    bom: true,
  });

  if (records.length === 0) throw new Error('CSV has no data rows');

  // Header from first record keys (already parsed by columns:true)
  // Note: csv-parse with columns:true returns objects with keys = header values
  const rawHeaders = Object.keys(records[0]);
  const sanitized = rawHeaders.map(sanitizeHeader);
  const finalHeaders = dedupeHeaders(sanitized);

  // Map original → sanitized for display labels
  const headerMap = Object.fromEntries(rawHeaders.map((orig, i) => [finalHeaders[i], orig]));

  // Take sample rows
  const sampleRows = records.slice(0, OPTS.sample);

  // Column accumulators
  const colStats = finalHeaders.map(() => ({
    nonNullCount: 0,
    numericCount: 0,
    intCount: 0,
    maxIntDigits: 0,
    maxFracDigits: 0,
    dateCount: 0,
    datetimeCount: 0,
    boolCount: 0,
    hasNonNumericBool: false,
    maxLen: 0,
    distinct: new Set(),
    sampleVals: [],
  }));

  for (const row of sampleRows) {
    rawHeaders.forEach((orig, idx) => {
      const val = row[orig];
      const stats = colStats[idx];
      if (isNullLike(val)) return;
      stats.nonNullCount++;
      const strVal = String(val).trim();
      stats.maxLen = Math.max(stats.maxLen, strVal.length);
      if (stats.distinct.size < 20) stats.distinct.add(strVal);
      if (stats.sampleVals.length < 5) stats.sampleVals.push(strVal);

      // Numeric?
      const num = parseNumber(strVal);
      if (num !== null) {
        stats.numericCount++;
        if (Number.isInteger(num)) {
          stats.intCount++;
          const digits = String(Math.abs(num)).length;
          stats.maxIntDigits = Math.max(stats.maxIntDigits, digits);
        } else {
          const frac = (strVal.split('.')[1] || '').length;
          stats.maxFracDigits = Math.max(stats.maxFracDigits, frac);
          const intPart = String(Math.abs(Math.trunc(num))).length;
          stats.maxIntDigits = Math.max(stats.maxIntDigits, intPart);
        }
      }

      // Date?
      const dt = parseDateFlex(val, OPTS.dateFormat);
      if (dt) {
        if (dt.type === 'datetime') stats.datetimeCount++;
        else stats.dateCount++;
      }

      // Boolean?
      const b = parseBool(val);
      if (b !== null) {
        stats.boolCount++;
        if (!/^[01]$/.test(strVal)) stats.hasNonNumericBool = true;
      }
    });
  }

  // Decide type per column
  const columns = finalHeaders.map((name, idx) => {
    const s = colStats[idx];
    const totalSampled = sampleRows.length;
    const nonNull = s.nonNullCount;

    if (nonNull === 0) {
      return {
        name,
        originalHeader: headerMap[name],
        mysqlType: 'VARCHAR(255)',
        inferredType: 'text',
        nullable: true,
        chartRole: 'label',
        semantic: null,
        displayLabel: headerMap[name],
        stats: { min: null, max: null, avg: null, distinctCount: 0, maxLength: 0, sampleValues: [] },
      };
    }

    const nullRatio = 1 - nonNull / totalSampled;
    const looksDate = s.dateCount / nonNull >= 0.9;
    const looksDatetime = s.datetimeCount / nonNull >= 0.9;
    const looksNumeric = s.numericCount === nonNull;
    const looksBool = (s.boolCount === nonNull) && s.hasNonNumericBool;
    const looksPureNumericBool = (s.boolCount === nonNull) && !s.hasNonNumericBool;

    let mysqlType, inferredType, chartRole;

    if (looksDatetime) {
      mysqlType = 'DATETIME';
      inferredType = 'datetime';
      chartRole = 'date';
    } else if (looksDate) {
      mysqlType = 'DATE';
      inferredType = 'date';
      chartRole = 'date';
    } else if (looksPureNumericBool) {
      // pure 0/1 → INT (not boolean)
      mysqlType = 'INT';
      inferredType = 'int';
      chartRole = 'numeric';
    } else if (looksBool) {
      mysqlType = 'TINYINT(1)';
      inferredType = 'boolean';
      chartRole = 'category';
    } else if (looksNumeric) {
      if (s.intCount === nonNull) {
        const needsBigInt = s.maxIntDigits > 10; // > 2^31-ish
        mysqlType = needsBigInt ? 'BIGINT' : 'INT';
        inferredType = 'int';
      } else {
        // DECIMAL with bounded precision
        const p = Math.min(s.maxIntDigits + s.maxFracDigits, 18);
        const scl = Math.min(s.maxFracDigits, 6);
        mysqlType = `DECIMAL(${p},${scl})`;
        inferredType = 'decimal';
      }
      chartRole = 'numeric';
    } else if (s.maxLen > 255) {
      mysqlType = 'TEXT';
      inferredType = 'text';
      chartRole = 'text';
    } else {
      const n = Math.min(Math.max(Math.ceil(s.maxLen * 1.5), 8), 255);
      mysqlType = `VARCHAR(${n})`;
      inferredType = s.distinct.size <= 12 ? 'category' : 'text';
      chartRole = s.distinct.size <= 12 ? 'category' : 'label';
    }

    // Semantic tag
    let semantic = null;
    for (const { key, re } of SEMANTIC_PATTERNS) {
      if (re.test(headerMap[name])) { semantic = key; break; }
    }

    // Compute min/max/avg for numeric columns
    let min = null, max = null, avg = null;
    if (looksNumeric) {
      const nums = sampleRows
        .map(r => parseNumber(r[headerMap[name]]))
        .filter(n => n !== null);
      if (nums.length) {
        min = Math.min(...nums);
        max = Math.max(...nums);
        avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
    }

    return {
      name,
      originalHeader: headerMap[name],
      mysqlType,
      inferredType,
      nullable: nullRatio > 0,
      chartRole,
      semantic,
      displayLabel: headerMap[name],
      stats: {
        min,
        max,
        avg: avg != null ? Number(avg.toFixed(2)) : null,
        distinctCount: s.distinct.size,
        maxLength: s.maxLen,
        sampleValues: s.sampleVals,
      },
    };
  });

  // Reserve 'id' for surrogate key
  if (columns.some(c => c.name === 'id')) {
    const idx = columns.findIndex(c => c.name === 'id');
    columns[idx].name = 'col_id';
    log('Renamed conflicting header "id" → "col_id" to reserve surrogate key');
  }

  return { columns, rawHeaders };
}

// ──────────────────────────────────────────────────────────────
// Build CREATE DATABASE / TABLE statements
// ──────────────────────────────────────────────────────────────
function buildDDL(dbName, tblName, columns, replace) {
  const lines = [];
  lines.push(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
  lines.push(`USE \`${dbName}\`;`);
  if (replace) lines.push(`DROP TABLE IF EXISTS \`${tblName}\`;`);
  lines.push(`CREATE TABLE IF NOT EXISTS \`${tblName}\` (`);
  lines.push('  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,');
  for (const c of columns) {
    lines.push(`  \`${c.name}\` ${c.mysqlType} ${c.nullable ? '' : 'NOT NULL'},`);
  }
  lines.push('  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,');
  lines.push('  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,');
  lines.push('  PRIMARY KEY (`id`)');
  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;');
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────
// Pass B: Stream + bulk INSERT with row-by-row fallback
// ──────────────────────────────────────────────────────────────
async function streamInsert(pool, csvPath, tblName, columns, mapOrigToSanitized) {
  const colNames = columns.map(c => c.name);
  const placeholders = colNames.map(() => '?').join(',');
  const insertSQL = `INSERT INTO \`${tblName}\` (\`${colNames.join('`,`')}\`) VALUES (${placeholders})`;

  log('Pass B: streaming insert into', tblName);
  log('SQL:', insertSQL);

  let totalInserted = 0;
  let totalFailed = 0;
  const errorLogPath = path.join(process.cwd(), 'import_errors.log');
  const errorLog = fs.createWriteStream(errorLogPath, { flags: 'a' });

  // Stream parse
  const parser = fs.createReadStream(csvPath)
    .pipe(parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      quote: '"',
      escape: '"',
      bom: true,
    }));

  const batch = [];
  let lineNum = 0; // 1-based, header is line 1, first data row is line 2

  const flushBatch = async (rows, attempt = 1) => {
    if (!rows.length) return;
    const maxBatch = OPTS.batch;
    // Build multi-row VALUES: (?,?,...), (?,?,...), ...
    const rowPlaceholders = rows.map(() => `(${placeholders})`).join(',');
    const multiRowSQL = `INSERT INTO \`${tblName}\` (\`${colNames.join('`,`')}\`) VALUES ${rowPlaceholders}`;
    // Flatten all row values for the multi-row query
    const values = rows.flat();

    try {
      await pool.query(multiRowSQL, values);
      totalInserted += rows.length;
      if (OPTS.verbose || totalInserted % 5000 === 0) {
        log(`Inserted ${totalInserted} rows...`);
      }
    } catch (err) {
      // STRICT/overflow/date error → row-by-row fallback
      log(`Batch failed (${err.code || 'ERR'}), retrying row-by-row for ${rows.length} rows`);
      for (const [i, rowVals] of rows.entries()) {
        try {
          await pool.query(insertSQL, rowVals);
          totalInserted++;
        } catch (e) {
          totalFailed++;
          const origRow = rows[i];
          errorLog.write(
            `Line ${lineNum - rows.length + i + 1}: ${e.code} ${e.message}\n` +
            `  Values: ${JSON.stringify(origRow)}\n`
          );
        }
      }
    }
  };

  // Accumulate batches
  for await (const record of parser) {
    lineNum++;
    const rowVals = columns.map(c => {
      const origVal = record[c.originalHeader];
      if (isNullLike(origVal)) return null;

      const strVal = String(origVal).trim();

      // Coerce per inferred type
      switch (c.inferredType) {
        case 'int': return parseNumber(strVal);
        case 'decimal': return parseNumber(strVal);
        case 'bigint': return parseNumber(strVal);
        case 'boolean': return parseBool(strVal);
        case 'date': {
          const dt = parseDateFlex(origVal, OPTS.dateFormat);
          return dt ? dt.value : null;
        }
        case 'datetime': {
          const dt = parseDateFlex(origVal, OPTS.dateFormat);
          return dt ? dt.value : null;
        }
        default: return strVal;
      }
    });
    batch.push(rowVals);
    if (batch.length >= OPTS.batch) {
      await flushBatch(batch);
      batch.length = 0;
    }
  }

  // Flush remainder
  await flushBatch(batch);
  errorLog.end();
  return { inserted: totalInserted, failed: totalFailed };
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main() {
  const csvPath = path.resolve(OPTS.file);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  // 1. Infer schema
  const { columns } = await inferSchema(csvPath);
  log('Inferred columns:', columns.map(c => `${c.name}:${c.mysqlType} (${c.inferredType})`).join(', '));

  // 2. Create DB pool (without database first — we'll CREATE it)
  const adminPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    connectionLimit: 5,
    multipleStatements: true, // DDL can have multiple statements
  });

  // 3. Run DDL
  const ddl = buildDDL(OPTS.db, OPTS.table, columns, OPTS.replace);
  log('DDL:\n', ddl);
  await adminPool.query(ddl);
  log('Database & table ready');

  // 4. Switch to the app pool (with database selected) for bulk insert
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: OPTS.db,
    connectionLimit: 10,
    decimalNumbers: true,
    charset: 'utf8mb4',
  });

  // 5. Stream insert
  const mapOrigToSanitized = Object.fromEntries(
    columns.map(c => [c.originalHeader, c.name])
  );
  const { inserted, failed } = await streamInsert(pool, csvPath, OPTS.table, columns, mapOrigToSanitized);

  // 6. Write schema_map.json
  const schemaMap = {
    database: OPTS.db,
    table: OPTS.table,
    sourceFile: path.basename(csvPath),
    importedAt: new Date().toISOString(),
    rowCount: inserted,
    columns,
  };
  const mapPath = path.join(process.cwd(), 'schema_map.json');
  fs.writeFileSync(mapPath, JSON.stringify(schemaMap, null, 2));
  log(`schema_map.json written to ${mapPath}`);

  // 7. Summary
  console.log('\n✅ Import complete');
  console.log(`   Rows inserted: ${inserted}`);
  console.log(`   Rows failed:   ${failed}`);
  console.log(`   Columns:       ${columns.length}`);
  console.log(`   Table:         ${OPTS.db}.${OPTS.table}`);
  console.log(`   Schema map:    ${mapPath}`);
  if (failed > 0) console.log(`   Errors logged: ${path.join(process.cwd(), 'import_errors.log')}`);

  await pool.end();
  await adminPool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});