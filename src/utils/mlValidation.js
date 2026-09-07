'use strict';

/**
 * ML Input Validation & Profile Adaptation
 * Single source of truth for all ML prediction inputs.
 */

const VALID_GENDERS = new Set(['Male', 'Female', 'Other']);
const VALID_PARENTAL_EDUCATION = new Set(['High School', 'Bachelor', 'Master', 'PhD', 'None']);
const BINARY_MAP = new Map([
  ['yes', 1], ['y', 1], ['true', 1], ['1', 1],
  ['no', 0], ['n', 0], ['false', 0], ['0', 0],
]);

function parseBinary(value, field) {
  if (typeof value === 'number' && (value === 0 || value === 1)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (BINARY_MAP.has(normalized)) return BINARY_MAP.get(normalized);
  }
  throw new RangeError(`${field} must be Yes/No, true/false, 1/0`);
}

function parseFiniteNumber(value, field, { min, max, integer = false } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    throw new RangeError(`${field} is required`);
  }
  if ((typeof value !== 'number' && typeof value !== 'string')
      || (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) {
    throw new RangeError(`${field} must be a finite number`);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new RangeError(`${field} must be a finite number`);
  }
  if (integer && !Number.isInteger(num)) {
    throw new RangeError(`${field} must be an integer`);
  }
  if (min !== undefined && num < min) {
    throw new RangeError(`${field} must be at least ${min}`);
  }
  if (max !== undefined && num > max) {
    throw new RangeError(`${field} must be at most ${max}`);
  }
  return num;
}

function parseEnum(value, field, validSet) {
  if (value === undefined || value === null || value === '') {
    throw new RangeError(`${field} is required`);
  }
  const str = String(value).trim();
  if (!validSet.has(str)) {
    throw new RangeError(`${field} must be one of: ${[...validSet].join(', ')}`);
  }
  return str;
}

function parseString(value, field, { maxLength = 100, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (!allowEmpty) throw new RangeError(`${field} is required`);
    return '';
  }
  const str = String(value).trim();
  if (!allowEmpty && str === '') {
    throw new RangeError(`${field} is required`);
  }
  if (str.length > maxLength) {
    throw new RangeError(`${field} cannot exceed ${maxLength} characters`);
  }
  return str;
}

/**
 * Strict validator for a single ML prediction profile.
 * Returns normalized Python-ready input object.
 */
function validatePredictionProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a plain object');
  }

  const knownFields = new Set([
    'gender', 'age', 'study_hours_per_day', 'attendance_percent',
    'sleep_hours', 'previous_gpa', 'parental_education',
    'internet_access', 'extracurricular', 'part_time_job',
  ]);

  // Reject unknown fields
  for (const key of Object.keys(input)) {
    if (!knownFields.has(key)) {
      throw new RangeError(`Unknown field: ${key}`);
    }
  }

  return {
    gender: parseEnum(input.gender, 'gender', VALID_GENDERS),
    age: parseFiniteNumber(input.age, 'age', { min: 10, max: 100, integer: true }),
    study_hours_per_day: parseFiniteNumber(input.study_hours_per_day, 'study_hours_per_day', { min: 0, max: 24 }),
    attendance_percent: parseFiniteNumber(input.attendance_percent, 'attendance_percent', { min: 0, max: 100, integer: true }),
    sleep_hours: parseFiniteNumber(input.sleep_hours, 'sleep_hours', { min: 0, max: 24 }),
    previous_gpa: parseFiniteNumber(input.previous_gpa, 'previous_gpa', { min: 0, max: 4.0 }),
    parental_education: parseEnum(input.parental_education, 'parental_education', VALID_PARENTAL_EDUCATION),
    internet_access: parseBinary(input.internet_access, 'internet_access'),
    extracurricular: parseBinary(input.extracurricular, 'extracurricular'),
    part_time_job: parseBinary(input.part_time_job, 'part_time_job'),
  };
}

/**
 * Adapter: Convert a schema-map student row to ML prediction profile.
 * Uses 'semantic' tags (not 'semanticTag') from schema_map.json.
 */
function normalizeFieldKey(value) {
  return typeof value === 'string'
    ? value.replace(/[^a-z0-9]/gi, '').toLowerCase()
    : '';
}

const PROFILE_FIELD_ALIASES = Object.freeze({
  gender: ['gender'],
  age: ['age'],
  study_hours_per_day: ['study_hours_per_day', 'study_hours', 'studyHours'],
  attendance_percent: ['attendance_percent', 'attendance'],
  sleep_hours: ['sleep_hours', 'sleep'],
  previous_gpa: ['previous_gpa', 'gpa'],
  parental_education: ['parental_education', 'parentalEducation'],
  internet_access: ['internet_access', 'internetAccess'],
  extracurricular: ['extracurricular'],
  part_time_job: ['part_time_job', 'partTimeJob'],
});

function studentToProfile(student, schemaMap) {
  if (!student || typeof student !== 'object' || Array.isArray(student)) {
    throw new TypeError('Student record required');
  }

  const columns = Array.isArray(schemaMap)
    ? schemaMap
    : (Array.isArray(schemaMap?.columns) ? schemaMap.columns : []);
  const bySemantic = new Map();
  for (const column of columns) {
    if (!column || typeof column.name !== 'string') continue;
    const semanticKey = normalizeFieldKey(column.semantic ?? column.semanticTag);
    if (semanticKey) bySemantic.set(semanticKey, column.name);
  }

  const get = (field) => {
    const aliases = PROFILE_FIELD_ALIASES[field];
    for (const alias of aliases) {
      const mappedName = bySemantic.get(normalizeFieldKey(alias));
      if (mappedName && Object.hasOwn(student, mappedName)) return student[mappedName];
    }
    for (const alias of aliases) {
      if (Object.hasOwn(student, alias)) return student[alias];
    }
    return null;
  };

  return Object.fromEntries(
    Object.keys(PROFILE_FIELD_ALIASES).map((field) => [field, get(field)])
  );
}

module.exports = {
  validatePredictionProfile,
  studentToProfile,
  VALID_GENDERS,
  VALID_PARENTAL_EDUCATION,
};