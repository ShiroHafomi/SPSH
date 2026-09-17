'use strict';

const { parseUtcInstant } = require('../services/assignmentService');
const MAX_VERSION = 4294967295;
const TEXT_LIMITS = { title: 150, learned_text: 3000, difficulties_text: 2000, next_steps_text: 2000 };
class JournalError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function invalid() { throw new JournalError(400, 'JOURNAL_INVALID_INPUT', 'Invalid learning journal input.'); }
function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) invalid();
}
function positiveId(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) invalid();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) invalid();
  return number;
}
function versionInput(value) {
  const version = positiveId(value);
  if (version > MAX_VERSION) invalid();
  return version;
}
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = parseUtcInstant(`${value}T00:00:00.000Z`);
  if (!date || date.getUTCFullYear() < 1000) invalid();
  return value;
}
function entryInput(input, today, editing = false) {
  fields(input, [...Object.keys(TEXT_LIMITS), 'entry_date', 'understanding_rating', ...(editing ? ['version'] : [])]);
  const data = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    const value = input[key] === undefined && !['title', 'learned_text'].includes(key) ? '' : input[key];
    if (typeof value !== 'string') invalid();
    const text = value.trim();
    if (text.length > max || (['title', 'learned_text'].includes(key) && !text) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) invalid();
    if (key === 'title' && /[\r\n\t]/.test(text)) invalid();
    data[key] = text;
  }
  data.entry_date = dateOnly(input.entry_date);
  if (data.entry_date > dateOnly(today)) invalid();
  const rating = input.understanding_rating ?? null;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) invalid();
  data.understanding_rating = rating;
  if (editing) data.version = versionInput(input.version);
  return data;
}
function deleteInput(input) { fields(input, ['version']); return versionInput(input.version); }
function listInput(input = {}) {
  fields(input, ['q', 'from', 'to', 'rating', 'page', 'size']);
  const page = input.page === undefined ? 1 : positiveId(input.page);
  const size = input.size === undefined ? 20 : positiveId(input.size);
  if (size > 100 || !Number.isSafeInteger((page - 1) * size) || (page - 1) * size > 100000) invalid();
  if (input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 100 || /[\x00-\x1f\x7f]/.test(input.q))) invalid();
  const q = (input.q || '').trim();
  const from = input.from === undefined ? null : dateOnly(input.from);
  const to = input.to === undefined ? null : dateOnly(input.to);
  if (from && to && (from > to || (new Date(to) - new Date(from)) / 86400000 >= 366)) invalid();
  const rating = input.rating === undefined ? null : positiveId(input.rating);
  if (rating !== null && rating > 5) invalid();
  return { page, size, q, from, to, rating };
}
module.exports = { JournalError, MAX_VERSION, TEXT_LIMITS, positiveId, versionInput, dateOnly, entryInput, deleteInput, listInput };
