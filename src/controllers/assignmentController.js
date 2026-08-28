'use strict';

/**
 * Student-only personal assignment handlers. Student ownership is derived from
 * authenticated server state and never accepted from request data.
 */
let assignmentService = require('../services/assignmentService');
let { logAuditEvent } = require('../services/authService');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

const LIST_QUERY_FIELDS = new Set([
  'q', 'subject', 'status', 'priority', 'overdue', 'from', 'to', 'page', 'size', 'sort',
]);
const CREATE_FIELDS = new Set(['title', 'subject', 'description', 'due_at', 'timezone', 'priority', 'status']);
const UPDATE_FIELDS = new Set([...CREATE_FIELDS, 'version']);
const MAX_DATE_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function __setAssignmentService(service) {
  assignmentService = service;
}

function __setLogAuditEvent(handler) {
  logAuditEvent = handler;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireAssignmentOwner(req, res) {
  const userId = parsePositiveSafeInteger(req.user?.id);
  if (userId === null) {
    res.status(401).json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' });
    return null;
  }

  const studentId = parsePositiveSafeInteger(req.user?.studentId);
  if (studentId === null) {
    res.status(400).json({ error: 'No student record linked to this account.' });
    return null;
  }
  return { userId, studentId };
}

function firstUnknownField(value, allowed) {
  if (!isPlainObject(value)) return 'body';
  return Object.keys(value).find((key) => !allowed.has(key)) || null;
}

function parseStrictInteger(value, { field, fallback, min = 1, max = Number.MAX_SAFE_INTEGER }) {
  if (value === undefined || value === '') return { value: fallback };
  if (typeof value !== 'string' && typeof value !== 'number') return { error: `${field} must be an integer.` };
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return { error: `${field} must be an integer.` };
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    return { error: `${field} must be between ${min} and ${max}.` };
  }
  return { value: number };
}

function parseBoundedText(value, { field, max }) {
  if (value === undefined || value === '') return { value: undefined };
  if (typeof value !== 'string') return { error: `${field} must be a string.` };
  const normalized = value.trim();
  if (normalized.length > max) return { error: `${field} must be at most ${max} characters.` };
  return { value: normalized || undefined };
}

function parseBooleanFilter(value) {
  if (value === undefined || value === '') return { value: undefined };
  if (value === true || value === 'true') return { value: true };
  if (value === false || value === 'false') return { value: false };
  return { error: 'overdue must be true or false.' };
}

function parseDateFilter(value, field) {
  if (value === undefined || value === '') return { value: undefined };
  const date = assignmentService.parseUtcInstant(value);
  if (!date) return { error: `${field} must be a valid datetime with an explicit UTC offset.` };
  return { value: date.toISOString(), date };
}

function parseListQuery(query) {
  if (!isPlainObject(query)) return { error: 'Assignment query must be an object.' };
  for (const key of Object.keys(query)) {
    if (!LIST_QUERY_FIELDS.has(key)) return { error: `Unsupported assignment query parameter: ${key}.` };
  }

  const q = parseBoundedText(query.q, { field: 'q', max: 100 });
  if (q.error) return q;
  const subject = parseBoundedText(query.subject, { field: 'subject', max: 80 });
  if (subject.error) return subject;

  const status = query.status === '' ? undefined : query.status;
  if (status !== undefined && !assignmentService.VALID_STATUSES.includes(status)) {
    return { error: `status must be one of: ${assignmentService.VALID_STATUSES.join(', ')}.` };
  }
  const priority = query.priority === '' ? undefined : query.priority;
  if (priority !== undefined && !assignmentService.VALID_PRIORITIES.includes(priority)) {
    return { error: `priority must be one of: ${assignmentService.VALID_PRIORITIES.join(', ')}.` };
  }

  const overdue = parseBooleanFilter(query.overdue);
  if (overdue.error) return overdue;
  const from = parseDateFilter(query.from, 'from');
  if (from.error) return from;
  const to = parseDateFilter(query.to, 'to');
  if (to.error) return to;
  if (from.date && to.date) {
    const range = to.date.getTime() - from.date.getTime();
    if (range < 0) return { error: 'to must not be before from.' };
    if (range > MAX_DATE_RANGE_MS) return { error: 'Date range cannot exceed 366 days.' };
  }

  const page = parseStrictInteger(query.page, { field: 'page', fallback: 1 });
  if (page.error) return page;
  const size = parseStrictInteger(query.size, { field: 'size', fallback: 20, max: 100 });
  if (size.error) return size;
  const sort = query.sort === '' || query.sort === undefined ? 'due_asc' : query.sort;
  if (!Object.prototype.hasOwnProperty.call(assignmentService.SORT_SQL, sort)) {
    return { error: `sort must be one of: ${Object.keys(assignmentService.SORT_SQL).join(', ')}.` };
  }

  const offset = (page.value - 1) * size.value;
  if (!Number.isSafeInteger(offset) || offset > assignmentService.MAX_OFFSET) {
    return { error: `Pagination offset cannot exceed ${assignmentService.MAX_OFFSET}.` };
  }

  return {
    options: {
      q: q.value,
      subject: subject.value,
      status,
      priority,
      overdue: overdue.value,
      from: from.value,
      to: to.value,
      page: page.value,
      size: size.value,
      sort,
    },
  };
}

function parseAssignmentId(value) {
  const assignmentId = parsePositiveSafeInteger(value);
  return assignmentId === null ? { error: 'Assignment ID must be a positive integer.' } : { assignmentId };
}

function logControllerError(label, err) {
  console.error(label, { code: err?.code || 'UNKNOWN' });
}

function auditContext(req) {
  return {
    ipAddress: req.ip || req.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: req.headers?.['user-agent'],
  };
}

async function recordAssignmentAudit(event) {
  try {
    await logAuditEvent(event);
  } catch (err) {
    // The assignment mutation already succeeded; audit storage must not make a retry duplicate it.
    logControllerError('[assignmentAudit]', err);
  }
}

async function apiListAssignments(req, res) {
  const owner = requireAssignmentOwner(req, res);
  if (!owner) return;
  const { studentId } = owner;
  const parsed = parseListQuery(req.query || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const result = await assignmentService.listAssignmentsForStudent(owner, parsed.options);
    return res.json(result);
  } catch (err) {
    if (err?.code === 'OFFSET_TOO_LARGE') return res.status(400).json({ error: err.message });
    logControllerError('[apiListAssignments]', err);
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }
}

async function apiGetAssignment(req, res) {
  const parsedId = parseAssignmentId(req.params.assignmentId);
  if (parsedId.error) return res.status(400).json({ error: parsedId.error });
  const owner = requireAssignmentOwner(req, res);
  if (!owner) return;
  const { studentId } = owner;

  const asOf = new Date();
  try {
    const assignment = await assignmentService.getAssignmentByIdForStudent(
      parsedId.assignmentId,
      owner,
      { asOf }
    );
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    return res.json({ assignment, asOf: asOf.toISOString() });
  } catch (err) {
    logControllerError('[apiGetAssignment]', err);
    return res.status(500).json({ error: 'Failed to load assignment.' });
  }
}

async function apiCreateAssignment(req, res) {
  const owner = requireAssignmentOwner(req, res);
  if (!owner) return;
  const { studentId } = owner;
  const unknown = firstUnknownField(req.body, CREATE_FIELDS);
  if (unknown) return res.status(400).json({ error: unknown === 'body' ? 'Assignment body must be an object.' : `Unknown field: ${unknown}` });

  const now = new Date();
  try {
    const result = await assignmentService.createAssignmentForStudent(owner, req.body, { now });
    if (!result.created) return res.status(400).json({ error: result.errors[0], errors: result.errors });

    await recordAssignmentAudit({
      userId: req.user.id,
      action: 'CREATE_ASSIGNMENT',
      resourceType: 'student_assignment',
      resourceId: result.assignment.id,
      metadata: { studentId, status: result.assignment.status, priority: result.assignment.priority },
      ...auditContext(req),
    });
    return res.status(201).json({ assignment: result.assignment, asOf: now.toISOString() });
  } catch (err) {
    logControllerError('[apiCreateAssignment]', err);
    return res.status(500).json({ error: 'Failed to create assignment.' });
  }
}

async function apiUpdateAssignment(req, res) {
  const parsedId = parseAssignmentId(req.params.assignmentId);
  if (parsedId.error) return res.status(400).json({ error: parsedId.error });
  const owner = requireAssignmentOwner(req, res);
  if (!owner) return;
  const { studentId } = owner;
  const unknown = firstUnknownField(req.body, UPDATE_FIELDS);
  if (unknown) return res.status(400).json({ error: unknown === 'body' ? 'Assignment body must be an object.' : `Unknown field: ${unknown}` });

  const version = parsePositiveSafeInteger(req.body.version);
  if (version === null) return res.status(400).json({ error: 'version must be a positive integer.' });
  const updates = { ...req.body };
  delete updates.version;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'At least one assignment field must be updated.' });

  const now = new Date();
  try {
    const result = await assignmentService.updateAssignmentForStudent(
      owner,
      parsedId.assignmentId,
      updates,
      version,
      { now }
    );
    if (!result.found) return res.status(404).json({ error: 'Assignment not found.' });
    if (result.conflict) {
      return res.status(409).json({
        error: 'This assignment was changed elsewhere. Refresh and try again.',
        code: 'ASSIGNMENT_VERSION_CONFLICT',
        assignment: result.assignment,
      });
    }
    if (result.reason === 'reopen_before_deadline_change') {
      return res.status(400).json({
        error: 'Reopen this completed assignment before changing its deadline.',
        code: 'REOPEN_REQUIRED',
      });
    }
    if (result.errors?.length) {
      return res.status(400).json({ error: result.errors[0], errors: result.errors });
    }

    await recordAssignmentAudit({
      userId: req.user.id,
      action: 'UPDATE_ASSIGNMENT',
      resourceType: 'student_assignment',
      resourceId: parsedId.assignmentId,
      metadata: { studentId, updatedFields: Object.keys(updates) },
      ...auditContext(req),
    });
    return res.json({ assignment: result.assignment, asOf: now.toISOString() });
  } catch (err) {
    logControllerError('[apiUpdateAssignment]', err);
    return res.status(500).json({ error: 'Failed to update assignment.' });
  }
}

async function apiDeleteAssignment(req, res) {
  const parsedId = parseAssignmentId(req.params.assignmentId);
  if (parsedId.error) return res.status(400).json({ error: parsedId.error });
  const owner = requireAssignmentOwner(req, res);
  if (!owner) return;
  const { studentId } = owner;
  if (!isPlainObject(req.query || {})) {
    return res.status(400).json({ error: 'Assignment delete query must be an object.' });
  }
  const unknownQuery = Object.keys(req.query || {}).find((key) => key !== 'version');
  if (unknownQuery) {
    return res.status(400).json({ error: `Unsupported assignment delete query parameter: ${unknownQuery}.` });
  }
  const version = parsePositiveSafeInteger(req.query?.version);
  if (version === null) return res.status(400).json({ error: 'version must be a positive integer.' });

  try {
    const result = await assignmentService.deleteAssignmentForStudent(
      owner,
      parsedId.assignmentId,
      version
    );
    if (!result.found) return res.status(404).json({ error: 'Assignment not found.' });
    if (result.conflict) {
      return res.status(409).json({
        error: 'This assignment was changed elsewhere. Refresh and try again.',
        code: 'ASSIGNMENT_VERSION_CONFLICT',
        assignment: result.assignment,
      });
    }

    await recordAssignmentAudit({
      userId: req.user.id,
      action: 'DELETE_ASSIGNMENT',
      resourceType: 'student_assignment',
      resourceId: parsedId.assignmentId,
      metadata: { studentId },
      ...auditContext(req),
    });
    return res.json({ message: 'Assignment deleted successfully.', assignmentId: parsedId.assignmentId });
  } catch (err) {
    logControllerError('[apiDeleteAssignment]', err);
    return res.status(500).json({ error: 'Failed to delete assignment.' });
  }
}

module.exports = {
  __setAssignmentService,
  __setLogAuditEvent,
  apiCreateAssignment,
  apiDeleteAssignment,
  apiGetAssignment,
  apiListAssignments,
  apiUpdateAssignment,
  parseListQuery,
};
