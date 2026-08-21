'use strict';

function parsePositiveSafeInteger(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    value = Number(trimmed);
  }

  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function normalizePositiveIds(value, { max = 100, field = 'ids' } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }

  const ids = [];
  const seen = new Set();
  for (const raw of value) {
    const id = parsePositiveSafeInteger(raw);
    if (id === null) {
      throw new TypeError(`${field} must contain only positive integer IDs.`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  if (ids.length > max) {
    throw new RangeError(`${field} cannot contain more than ${max} IDs.`);
  }
  return ids;
}

function boundedString(value, { field, max, allowEmpty = true } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new TypeError(`${field || 'value'} must be a string.`);
  }
  const normalized = value.trim();
  if (!allowEmpty && normalized === '') {
    throw new TypeError(`${field || 'value'} is required.`);
  }
  if (normalized.length > max) {
    throw new RangeError(`${field || 'value'} cannot exceed ${max} characters.`);
  }
  return normalized;
}

function normalizeBulkFilters(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('filters must be an object.');
  }

  const normalized = {};
  const fields = {
    q: 200,
    grade: 50,
    gender: 50,
    part_time_job: 50,
    parental_education: 100,
    at_risk: 20,
  };
  for (const [field, max] of Object.entries(fields)) {
    if (value[field] !== undefined) {
      normalized[field] = boundedString(value[field], { field: `filters.${field}`, max });
    }
  }
  return normalized;
}

/**
 * Validate student data against column definitions from schema_map.
 * @param {Object} data - The data object to validate
 * @param {Array} columns - Array of column definitions with name, type, maxLen, etc.
 * @returns {Array<string>} Array of error messages (empty if valid)
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
  boundedString,
  normalizeBulkFilters,
  normalizePositiveIds,
  parsePositiveSafeInteger,
  validateStudentData,
};
