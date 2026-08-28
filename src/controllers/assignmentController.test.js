'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./assignmentController');
const realService = require('../services/assignmentService');
const { logAuditEvent: realLogAuditEvent } = require('../services/authService');
const { requireRole } = require('../middleware/auth');

const service = {};
let auditEvents;

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createRequest({ user = {}, query = {}, body = {}, params = {} } = {}) {
  return {
    user: { id: 99, role: 'student', studentId: 7, ...user },
    query,
    body,
    params,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'assignment-test' },
  };
}

beforeEach(() => {
  Object.assign(service, {
    MAX_OFFSET: 100_000,
    SORT_SQL: realService.SORT_SQL,
    VALID_PRIORITIES: realService.VALID_PRIORITIES,
    VALID_STATUSES: realService.VALID_STATUSES,
    parseUtcInstant: realService.parseUtcInstant,
    listAssignmentsForStudent: async () => ({
      assignments: [],
      pagination: { page: 1, size: 20, total: 0, totalPages: 0 },
      summary: { todo: 0, inProgress: 0, done: 0, overdue: 0 },
      asOf: '2026-08-28T00:00:00.000Z',
    }),
    getAssignmentByIdForStudent: async () => null,
    createAssignmentForStudent: async () => ({ created: true, assignment: { id: 11, status: 'todo', priority: 'medium' } }),
    updateAssignmentForStudent: async () => ({ found: true, conflict: false, updated: true, assignment: { id: 11, version: 2 } }),
    deleteAssignmentForStudent: async () => ({
      found: true,
      conflict: false,
      deleted: true,
      assignment: null,
    }),
  });
  auditEvents = [];
  controller.__setAssignmentService(service);
  controller.__setLogAuditEvent(async (event) => auditEvents.push(event));
});

afterEach(() => {
  controller.__setAssignmentService(realService);
  controller.__setLogAuditEvent(realLogAuditEvent);
});

describe('assignment student access boundary', () => {
  it('rejects unsupported roles through the student route role guard', () => {
    for (const role of ['teacher', 'admin']) {
      const res = createResponse();
      let nextCalled = false;
      requireRole('student')({ user: { role } }, res, () => { nextCalled = true; });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, 'FORBIDDEN');
      assert.equal(nextCalled, false);
    }
  });

  it('returns 401 when the role guard has no authenticated user', () => {
    const res = createResponse();
    requireRole('student')({}, res, () => assert.fail('next should not run'));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  });

  it('requires a linked student record', async () => {
    const res = createResponse();
    await controller.apiListAssignments(createRequest({ user: { studentId: null } }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /No student record/);
  });

  it('requires an authenticated account ID for personal ownership', async () => {
    const res = createResponse();
    await controller.apiListAssignments(createRequest({ user: { id: null } }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  });
});

describe('assignment list query validation', () => {
  it('normalizes valid filters and resets no values implicitly', () => {
    const parsed = controller.parseListQuery({
      q: ' essay ',
      subject: 'History',
      status: 'in_progress',
      priority: 'high',
      overdue: 'false',
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T00:00:00Z',
      page: '2',
      size: '10',
      sort: 'due_desc',
    });
    assert.deepStrictEqual(parsed.options, {
      q: 'essay',
      subject: 'History',
      status: 'in_progress',
      priority: 'high',
      overdue: false,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
      page: 2,
      size: 10,
      sort: 'due_desc',
    });
  });

  it('rejects unknown filters and bounded search text', () => {
    assert.match(controller.parseListQuery({ unknown: 'x' }).error, /Unsupported/);
    assert.match(controller.parseListQuery({ q: 'x'.repeat(101) }).error, /at most 100/);
    assert.match(controller.parseListQuery({ subject: 'x'.repeat(81) }).error, /at most 80/);
  });

  it('rejects invalid enums and booleans', () => {
    assert.match(controller.parseListQuery({ status: 'overdue' }).error, /status/);
    assert.match(controller.parseListQuery({ priority: 'urgent' }).error, /priority/);
    assert.match(controller.parseListQuery({ overdue: 'yes' }).error, /true or false/);
    assert.match(controller.parseListQuery({ sort: 'DROP TABLE' }).error, /sort/);
  });

  it('rejects invalid, reversed, and excessive date ranges', () => {
    assert.match(controller.parseListQuery({ from: '2026-01-01' }).error, /explicit UTC offset/);
    assert.match(controller.parseListQuery({
      from: '2026-02-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    }).error, /must not be before/);
    assert.match(controller.parseListQuery({
      from: '2025-01-01T00:00:00Z',
      to: '2026-01-03T00:00:00Z',
    }).error, /cannot exceed 366/);
  });

  it('rejects invalid pagination and excessive offsets', () => {
    assert.match(controller.parseListQuery({ page: '1.5' }).error, /integer/);
    assert.match(controller.parseListQuery({ size: '101' }).error, /between 1 and 100/);
    assert.match(controller.parseListQuery({ page: '1002', size: '100' }).error, /offset/);
  });

  it('passes normalized ownership and filters to the list service', async () => {
    let received;
    service.listAssignmentsForStudent = async (...args) => {
      received = args;
      return { assignments: [], pagination: {}, summary: {}, asOf: 'now' };
    };
    const req = createRequest({ query: { page: '2', size: '5', status: 'todo' } });
    const res = createResponse();
    await controller.apiListAssignments(req, res);
    assert.deepStrictEqual(received[0], { userId: 99, studentId: 7 });
    assert.deepStrictEqual(received[1], {
      q: undefined,
      subject: undefined,
      status: 'todo',
      priority: undefined,
      overdue: undefined,
      from: undefined,
      to: undefined,
      page: 2,
      size: 5,
      sort: 'due_asc',
    });
    assert.equal(res.statusCode, 200);
  });
});

describe('assignment controller mutations', () => {
  it('rejects body-provided identity and unknown fields', async () => {
    for (const field of ['student_id', 'studentId', 'owner_user_id', 'unknown']) {
      const res = createResponse();
      await controller.apiCreateAssignment(createRequest({ body: { [field]: 123 } }), res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, new RegExp(field));
    }
  });

  it('creates a valid assignment for the authenticated student only', async () => {
    let received;
    service.createAssignmentForStudent = async (...args) => {
      received = args;
      return { created: true, assignment: { id: 11, student_id: 7, status: 'todo', priority: 'medium' } };
    };
    const body = {
      title: 'Essay',
      due_at: '2026-09-01T09:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
    };
    const res = createResponse();
    await controller.apiCreateAssignment(createRequest({ body }), res);

    assert.deepStrictEqual(received[0], { userId: 99, studentId: 7 });
    assert.strictEqual(received[1], body);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.assignment.student_id, 7);
    assert.equal(auditEvents.length, 1);
    assert.deepStrictEqual(auditEvents[0].metadata, { studentId: 7, status: 'todo', priority: 'medium' });
    assert.equal(Object.hasOwn(auditEvents[0].metadata, 'description'), false);
  });

  it('returns successful mutation responses when audit storage is unavailable', async () => {
    controller.__setLogAuditEvent(async () => {
      const error = new Error('audit database unavailable');
      error.code = 'ER_AUDIT_UNAVAILABLE';
      throw error;
    });
    const originalConsoleError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);

    try {
      let res = createResponse();
      await controller.apiCreateAssignment(createRequest({ body: {
        title: 'Essay', due_at: '2026-09-01T00:00:00Z', timezone: 'UTC',
      } }), res);
      assert.equal(res.statusCode, 201);

      res = createResponse();
      await controller.apiUpdateAssignment(createRequest({
        params: { assignmentId: '11' },
        body: { title: 'Revised essay', version: 1 },
      }), res);
      assert.equal(res.statusCode, 200);

      res = createResponse();
      await controller.apiDeleteAssignment(
        createRequest({ params: { assignmentId: '11' }, query: { version: '1' } }),
        res
      );
      assert.equal(res.statusCode, 200);
      assert.equal(logs.length, 3);
      assert.equal(JSON.stringify(logs).includes('audit database unavailable'), false);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('returns service validation errors without clearing request data', async () => {
    service.createAssignmentForStudent = async () => ({
      created: false,
      errors: ['title is required', 'priority must be one of: low, medium, high'],
    });
    const res = createResponse();
    await controller.apiCreateAssignment(createRequest({ body: {
      title: '', due_at: 'invalid', timezone: 'invalid', priority: 'urgent',
    } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errors.length, 2);
  });

  it('makes another student assignment indistinguishable from missing', async () => {
    service.getAssignmentByIdForStudent = async (assignmentId, owner) => {
      assert.equal(assignmentId, 11);
      assert.deepStrictEqual(owner, { userId: 99, studentId: 7 });
      return null;
    };
    const res = createResponse();
    await controller.apiGetAssignment(createRequest({ params: { assignmentId: '11' } }), res);
    assert.equal(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'Assignment not found.' });
  });

  it('requires a version and returns concurrent-update conflicts', async () => {
    let res = createResponse();
    await controller.apiUpdateAssignment(createRequest({
      params: { assignmentId: '11' },
      body: { title: 'Updated' },
    }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /version/);

    service.updateAssignmentForStudent = async () => ({
      found: true,
      conflict: true,
      updated: false,
      assignment: { id: 11, version: 3 },
    });
    res = createResponse();
    await controller.apiUpdateAssignment(createRequest({
      params: { assignmentId: '11' },
      body: { title: 'Updated', version: 2 },
    }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'ASSIGNMENT_VERSION_CONFLICT');
  });

  it('requires reopening before changing a completed deadline', async () => {
    service.updateAssignmentForStudent = async () => ({
      found: true,
      conflict: false,
      updated: false,
      reason: 'reopen_before_deadline_change',
    });
    const res = createResponse();
    await controller.apiUpdateAssignment(createRequest({
      params: { assignmentId: '11' },
      body: { due_at: '2026-10-01T00:00:00Z', version: 1 },
    }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'REOPEN_REQUIRED');
  });

  it('returns safe internal errors without exposing database details', async () => {
    service.createAssignmentForStudent = async () => {
      const error = new Error('SQL syntax near private description');
      error.code = 'ER_PARSE_ERROR';
      throw error;
    };
    const originalConsoleError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);
    try {
      const res = createResponse();
      await controller.apiCreateAssignment(createRequest({ body: {
        title: 'Essay',
        description: 'private description',
        due_at: '2026-09-01T00:00:00Z',
        timezone: 'UTC',
      } }), res);
      assert.equal(res.statusCode, 500);
      assert.deepStrictEqual(res.body, { error: 'Failed to create assignment.' });
      assert.equal(JSON.stringify(logs).includes('private description'), false);
      assert.equal(JSON.stringify(logs).includes('SQL syntax'), false);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('requires a version when deleting an assignment', async () => {
    const res = createResponse();
    await controller.apiDeleteAssignment(createRequest({ params: { assignmentId: '11' } }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /version/);
  });

  it('returns a conflict instead of deleting a newer assignment version', async () => {
    service.deleteAssignmentForStudent = async () => ({
      found: true,
      conflict: true,
      deleted: false,
      assignment: { id: 11, version: 4 },
    });
    const res = createResponse();
    await controller.apiDeleteAssignment(createRequest({
      params: { assignmentId: '11' },
      query: { version: '3' },
    }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'ASSIGNMENT_VERSION_CONFLICT');
    assert.equal(res.body.assignment.version, 4);
    assert.equal(auditEvents.length, 0);
  });

  it('deletes with student ownership and audits no content fields', async () => {
    let received;
    service.deleteAssignmentForStudent = async (...args) => {
      received = args;
      return { found: true, conflict: false, deleted: true, assignment: null };
    };
    const res = createResponse();
    await controller.apiDeleteAssignment(createRequest({
      params: { assignmentId: '11' },
      query: { version: '3' },
    }), res);
    assert.deepStrictEqual(received, [{ userId: 99, studentId: 7 }, 11, 3]);
    assert.equal(res.statusCode, 200);
    assert.equal(auditEvents[0].resourceId, 11);
    assert.deepStrictEqual(auditEvents[0].metadata, { studentId: 7 });
  });
});
