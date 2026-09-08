'use strict';

const { parseUtcInstant } = require('../services/assignmentService');
const MAX_SECONDS = 8 * 60 * 60;
const MAX_VERSION = 4294967295;
const STATUSES = ['running', 'paused', 'completed', 'discarded'];
const DAY = 86400000;

class StudyTimerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function invalid() { throw new StudyTimerError(400, 'STUDY_TIMER_INVALID_INPUT', 'Invalid study timer input.'); }
function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) invalid();
}
function positiveId(value) {
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) invalid();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) invalid();
  return number;
}
function startInput(input) {
  fields(input, ['title', 'assignment_id']);
  if (typeof input.title !== 'string') invalid();
  const title = input.title.trim();
  if (!title || title.length > 150 || /[\x00-\x1f\x7f]/.test(title)) invalid();
  return { title, assignmentId: input.assignment_id == null ? null : positiveId(input.assignment_id) };
}
function actionInput(input) {
  fields(input, ['version']);
  const version = positiveId(input.version);
  if (version > MAX_VERSION) invalid();
  return version;
}
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = parseUtcInstant(`${value}T00:00:00.000Z`);
  if (!date || date.getUTCFullYear() > 9998) invalid();
  return date;
}
function windowInput(input = {}, now = new Date(), history = false) {
  fields(input, history ? ['from', 'to', 'page', 'size', 'status'] : ['from', 'to']);
  let from, to;
  if (input.from === undefined && input.to === undefined) {
    to = now.toISOString().slice(0, 10);
    from = new Date(dateOnly(to).getTime() - 6 * DAY).toISOString().slice(0, 10);
  } else { from = input.from; to = input.to; }
  const start = dateOnly(from), end = dateOnly(to);
  const days = (end - start) / DAY + 1;
  if (days < 1 || days > 93) invalid();
  const page = history && input.page !== undefined ? positiveId(input.page) : 1;
  const size = history && input.size !== undefined ? positiveId(input.size) : 20;
  const offset = (page - 1) * size;
  if (size > 100 || !Number.isSafeInteger(offset) || offset > 100000) invalid();
  const status = input.status === undefined || input.status === 'all' ? null : input.status;
  if (status !== null && !['completed', 'discarded'].includes(status)) invalid();
  return { from, to, start, end: new Date(end.getTime() + DAY), page, size, offset, status };
}

function timerState(row, now) {
  const accumulated = Number(row.accumulated_seconds);
  const observed = parseUtcInstant(row.last_observed_at);
  const running = row.running_since === null ? null : parseUtcInstant(row.running_since);
  if (!STATUSES.includes(row.status) || !Number.isFinite(accumulated) || accumulated < 0 || accumulated > MAX_SECONDS || !observed || !parseUtcInstant(now) || (row.status === 'running' && !running)) {
    throw new Error('Invalid stored timer state.');
  }
  const clockAdjusted = now.getTime() < observed.getTime() || Boolean(running && now < running);
  const effective = new Date(Math.max(now.getTime(), observed.getTime(), running?.getTime() || 0));
  const elapsed = accumulated + (row.status === 'running' ? Math.max(0, effective - running) / 1000 : 0);
  const elapsedSeconds = Math.min(MAX_SECONDS, Math.round(elapsed * 1000) / 1000);
  return { elapsedSeconds, limitReached: elapsedSeconds >= MAX_SECONDS, clockAdjusted, effective };
}

module.exports = { MAX_SECONDS, MAX_VERSION, STATUSES, StudyTimerError, positiveId, startInput, actionInput, windowInput, timerState };
