/**
 * Allowed-column Set for sort/search whitelist.
 * This is the SQL-injection boundary: identifiers (column names) cannot be
 * parameterized in MySQL, so we only allow columns that exist in schema_map.json.
 */
const { getColumns, loadSchemaMap } = require('./schemaMap');

let _allowedColumns = null;
let _searchableColumns = null;
let _sortableColumns = null;

/**
 * Build the column whitelists from the current schema_map.
 * Call at app boot and after any re-import.
 */
function buildColumnSets() {
  loadSchemaMap(); // ensure loaded
  const cols = getColumns();

  _allowedColumns = new Set(cols.map(c => c.name));

  // Searchable = string-ish columns (VARCHAR, TEXT)
  _searchableColumns = cols
    .filter(c => c.mysqlType.startsWith('VARCHAR') || c.mysqlType === 'TEXT')
    .map(c => c.name);

  // Sortable = all columns except timestamps (or you could exclude id too)
  _sortableColumns = cols
    .filter(c => c.name !== 'created_at' && c.name !== 'updated_at')
    .map(c => c.name);
}

/** Returns a Set of column names that exist in the schema. */
function getAllowedColumns() {
  if (!_allowedColumns) buildColumnSets();
  return _allowedColumns;
}

/** Returns an array of column names safe for text search (LIKE). */
function getSearchableColumns() {
  if (!_searchableColumns) buildColumnSets();
  return _searchableColumns;
}

/** Returns an array of column names safe for ORDER BY. */
function getSortableColumns() {
  if (!_sortableColumns) buildColumnSets();
  return _sortableColumns;
}

/** Validate a sort column; return sanitized name or default 'id'. */
function validateSortColumn(requested) {
  const allowed = getSortableColumns();
  if (requested && allowed.includes(requested)) return requested;
  return 'id';
}

/** Validate a sort direction; return 'asc' or 'desc'. */
function validateSortDir(requested) {
  const dir = String(requested || '').toLowerCase();
  return dir === 'desc' ? 'desc' : 'asc';
}

/** Clamp page/size to safe bounds. */
function clampPagination(page, size) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const s = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
  return { page: p, size: s, offset: (p - 1) * s };
}

module.exports = {
  buildColumnSets,
  getAllowedColumns,
  getSearchableColumns,
  getSortableColumns,
  validateSortColumn,
  validateSortDir,
  clampPagination,
};