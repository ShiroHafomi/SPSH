/**
 * Load and validate schema_map.json at boot.
 * Provides a typed, cached contract for the rest of the app.
 */
const fs = require('fs');
const path = require('path');

let _schemaMap = null;

/**
 * Load schema_map.json from project root.
 * Returns the parsed object or null if not found/invalid.
 */
function loadSchemaMap() {
  const mapPath = path.join(process.cwd(), 'schema_map.json');
  if (!fs.existsSync(mapPath)) return null;

  try {
    const raw = fs.readFileSync(mapPath, 'utf8');
    const parsed = JSON.parse(raw);
    // Basic validation
    if (!parsed.columns || !Array.isArray(parsed.columns)) {
      console.warn('[schemaMap] schema_map.json missing "columns" array');
      return null;
    }
    _schemaMap = parsed;
    return _schemaMap;
  } catch (e) {
    console.error('[schemaMap] Failed to load schema_map.json:', e.message);
    return null;
  }
}

function getSchemaMap() {
  return _schemaMap;
}

function requireSchemaMap() {
  if (!_schemaMap) loadSchemaMap();
  if (!_schemaMap) {
    throw new Error('schema_map.json not loaded — run `npm run import` first');
  }
  return _schemaMap;
}

// Convenience getters used by chartConfig, views, etc.
function getColumns() {
  const m = getSchemaMap();
  return m?.columns || [];
}

function getColumnByName(name) {
  const cols = getColumns();
  return cols.find(c => c.name === name);
}

function getNumericColumns() {
  const cols = getColumns();
  return cols.filter(c => c.chartRole === 'numeric' && c.name !== 'id');
}

function getCategoryColumns() {
  const cols = getColumns();
  return cols.filter(c => c.chartRole === 'category');
}

function getDateColumns() {
  const cols = getColumns();
  return cols.filter(c => c.chartRole === 'date');
}

function getSemantic(key) {
  const cols = getColumns();
  return cols.find(c => c.semantic === key);
}

function getSemanticOrFirstNumeric(key) {
  const m = getSemantic(key);
  if (m) return m;
  // Fallback: first numeric non-id column
  const nums = getNumericColumns().filter(c => c.name !== 'student_id');
  return nums[0];
}

function getDisplayColumns() {
  // Columns to show in table/form (exclude surrogate id + timestamps)
  const cols = getColumns();
  return cols.filter(c => c.name !== 'id' && c.name !== 'created_at' && c.name !== 'updated_at');
}

module.exports = {
  loadSchemaMap,
  getSchemaMap,
  requireSchemaMap,
  getColumns,
  getColumnByName,
  getNumericColumns,
  getCategoryColumns,
  getDateColumns,
  getSemantic,
  getSemanticOrFirstNumeric,
  getDisplayColumns,
};