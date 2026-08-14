'use strict';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[",\r\n]/;

function encodeCsvCell(value) {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function encodeCsvRow(values) {
  return values.map(encodeCsvCell).join(',');
}

module.exports = {
  encodeCsvCell,
  encodeCsvRow,
};
