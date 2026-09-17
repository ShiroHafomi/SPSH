'use strict';

const { parsePositiveSafeInteger } = require('./inputValidation');

const PLAN_STATUSES = Object.freeze(['draft', 'active', 'completed', 'cancelled']);
const TASK_STATUSES = Object.freeze(['pending', 'in_progress', 'completed']);

class SupportPlanError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SupportPlanError';
    this.status = status;
    this.code = code;
  }
}

function invalid(code = 'SUPPORT_PLAN_INVALID_INPUT') {
  throw new SupportPlanError(400, code, 'Invalid support plan input.');
}

function positiveId(value) {
  const id = parsePositiveSafeInteger(value);
  if (id === null) invalid();
  return id;
}

function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}

function text(value, max, required = true) {
  if (!required && (value === undefined || value === null)) return '';
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)) invalid();
  return normalized;
}

function calendarDate(value, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) invalid('SUPPORT_PLAN_INVALID_DATES');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid('SUPPORT_PLAN_INVALID_DATES');
  return value;
}

function validateDraft(input, { edit = false } = {}) {
  fields(input, ['title', 'objective', 'start_date', 'due_date', 'tasks', ...(edit ? ['version'] : [])]);
  const start_date = calendarDate(input.start_date);
  const due_date = calendarDate(input.due_date);
  if (due_date < start_date) invalid('SUPPORT_PLAN_INVALID_DATES');
  if (!Array.isArray(input.tasks) || input.tasks.length > 20) invalid('SUPPORT_PLAN_INVALID_TASKS');
  const tasks = input.tasks.map(task => {
    fields(task, ['title', 'description', 'due_date']);
    const taskDue = calendarDate(task.due_date, true);
    if (taskDue && (taskDue < start_date || taskDue > due_date)) invalid('SUPPORT_PLAN_INVALID_DATES');
    return {
      title: text(task.title, 150),
      description: text(task.description, 1000, false),
      due_date: taskDue,
    };
  });
  return {
    title: text(input.title, 150),
    objective: text(input.objective, 2000),
    start_date,
    due_date,
    tasks,
    ...(edit ? { version: positiveId(input.version) } : {}),
  };
}

function validateTransition(input) {
  fields(input, ['version']);
  return { version: positiveId(input.version) };
}

function validateTaskUpdate(input) {
  fields(input, ['version', 'planVersion', 'status']);
  if (!TASK_STATUSES.includes(input.status)) invalid('SUPPORT_PLAN_INVALID_TASKS');
  return {
    version: positiveId(input.version),
    planVersion: positiveId(input.planVersion),
    status: input.status,
  };
}

function validateList(query = {}) {
  fields(query, ['page', 'size', 'status']);
  const page = query.page === undefined ? 1 : positiveId(query.page);
  const size = query.size === undefined ? 20 : positiveId(query.size);
  if (size > 100 || !Number.isSafeInteger((page - 1) * size) || (page - 1) * size > 100000) invalid();
  const status = query.status === undefined || query.status === 'all' ? null : query.status;
  if (status !== null && !PLAN_STATUSES.includes(status)) invalid();
  return { page, size, status };
}

function progress(plan, totalTaskCount, completedTaskCount, now = new Date()) {
  const total = Number(totalTaskCount);
  const completed = Number(completedTaskCount);
  if (!Number.isSafeInteger(total) || total < 0 || total > 20 || !Number.isSafeInteger(completed) || completed < 0 || completed > total) {
    throw new Error('Invalid support plan task counts.');
  }
  return {
    totalTaskCount: total,
    completedTaskCount: completed,
    progressPercent: total === 0 ? 0 : completed / total * 100,
    isOverdue: plan.status === 'active' && completed < total && plan.due_date < now.toISOString().slice(0, 10),
  };
}

module.exports = {
  PLAN_STATUSES, TASK_STATUSES, SupportPlanError, positiveId,
  validateDraft, validateTransition, validateTaskUpdate, validateList, calendarDate, progress,
};
