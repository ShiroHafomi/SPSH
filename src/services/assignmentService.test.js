'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const service = require('./assignmentService');

const originalQuery = pool.query;
const originalGetConnection = pool.getConnection;
let implementations;
let calls;
let transactionEvents;

const OWNER = Object.freeze({ studentId: 7, userId: 99 });

function queueQuery(implementation) {
  implementations.push(implementation);
}

function assignmentRow(overrides = {}) {
  return {
    id: 11,
    student_id: 7,
    title: 'Research essay',
    subject: 'History',
    description: 'Draft the introduction',
    due_at: new Date('2026-09-10T12:00:00.000Z'),
    timezone: 'Asia/Ho_Chi_Minh',
    priority: 'high',
    status: 'todo',
    completed_at: null,
    version: 1,
    created_at_epoch_ms: Date.parse('2026-08-20T00:00:00.000Z'),
    updated_at_epoch_ms: Date.parse('2026-08-20T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  implementations = [];
  calls = [];
  transactionEvents = [];
  pool.query = async (...args) => {
    calls.push(args);
    const implementation = implementations.shift();
    assert.ok(implementation, `Unexpected query: ${args[0]}`);
    return implementation(...args);
  };
  pool.getConnection = async () => ({
    query: async (...args) => {
      if (args[0] === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') {
        transactionEvents.push('isolation');
        return [[]];
      }
      return pool.query(...args);
    },
    beginTransaction: async () => transactionEvents.push('begin'),
    commit: async () => transactionEvents.push('commit'),
    rollback: async () => transactionEvents.push('rollback'),
    release: () => transactionEvents.push('release'),
  });
});

afterEach(() => {
  pool.query = originalQuery;
  pool.getConnection = originalGetConnection;
});

describe('assignmentService validation and time semantics', () => {
  it('does not globally reinterpret existing MySQL timestamps as UTC', () => {
    assert.notEqual(pool.pool.config.connectionConfig.timezone, 'Z');
  });

  it('accepts valid assignment data and IANA timezones', () => {
    const errors = service.validateAssignmentData({
      title: 'Essay',
      subject: null,
      description: null,
      due_at: '2026-09-01T09:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      priority: 'medium',
      status: 'todo',
    });
    assert.deepStrictEqual(errors, []);
    assert.equal(service.isValidTimeZone('Asia/Ho_Chi_Minh'), true);
  });

  it('rejects bounded text, invalid enum, date, and timezone values', () => {
    const errors = service.validateAssignmentData({
      title: 'x'.repeat(161),
      subject: 'x'.repeat(81),
      description: 'x'.repeat(2001),
      due_at: '2026-09-01T09:00:00',
      timezone: 'Invalid/Nowhere',
      priority: 'urgent',
      status: 'overdue',
    });
    assert.ok(errors.some((error) => error.includes('title')));
    assert.ok(errors.some((error) => error.includes('subject')));
    assert.ok(errors.some((error) => error.includes('description')));
    assert.ok(errors.some((error) => error.includes('explicit UTC offset')));
    assert.ok(errors.some((error) => error.includes('IANA')));
    assert.ok(errors.some((error) => error.includes('priority')));
    assert.ok(errors.some((error) => error.includes('status')));
  });

  it('accepts minute-precision offsets and rejects timezone-less client timestamps', () => {
    assert.equal(service.parseUtcInstant('2026-09-01T09:00:00'), null);
    assert.equal(service.parseUtcInstant('2026-09-01 09:00:00'), null);
    assert.equal(
      service.parseUtcInstant('2026-09-01T09:00+07:00').toISOString(),
      '2026-09-01T02:00:00.000Z'
    );
    assert.equal(
      service.parseUtcInstant('2026-09-01T09:00Z').toISOString(),
      '2026-09-01T09:00:00.000Z'
    );
  });

  it('rejects MySQL-style timezone-less deadlines at the validation boundary', () => {
    const errors = service.validateAssignmentData({
      title: 'Essay',
      due_at: '2026-09-01 09:00:00',
      timezone: 'Asia/Ho_Chi_Minh',
      priority: 'medium',
      status: 'todo',
    });
    assert.ok(errors.some((error) => error.includes('explicit UTC offset')));
  });

  it('rejects impossible dates and UTC instants outside the MySQL DATETIME range', () => {
    assert.equal(service.parseUtcInstant('2026-02-30T09:00:00Z'), null);
    assert.equal(service.parseUtcInstant('2026-13-01T09:00:00Z'), null);
    assert.equal(service.parseUtcInstant('0999-12-31T23:59:59Z'), null);
    assert.equal(service.parseUtcInstant('9999-12-31T23:59:59-01:00'), null);
    assert.equal(
      service.parseUtcInstant('1000-01-01T00:00:00Z').toISOString(),
      '1000-01-01T00:00:00.000Z'
    );
  });

  it('computes overdue and completed-late at the supplied server snapshot', () => {
    const now = new Date('2026-09-10T13:00:00.000Z');
    const overdue = service.presentAssignment(assignmentRow(), now);
    assert.equal(overdue.isOverdue, true);
    assert.equal(overdue.completedLate, false);

    const completed = service.presentAssignment(assignmentRow({
      status: 'done',
      completed_at: new Date('2026-09-10T12:00:01.000Z'),
    }), now);
    assert.equal(completed.isOverdue, false);
    assert.equal(completed.completedLate, true);
  });

  it('uses exact deadline boundaries for overdue and late completion', () => {
    const due = new Date('2026-09-10T12:00:00.000Z');
    assert.equal(service.presentAssignment(assignmentRow({ due_at: due }), due).isOverdue, false);
    assert.equal(service.presentAssignment(assignmentRow({
      due_at: due,
      status: 'done',
      completed_at: due,
    }), due).completedLate, false);
  });

  it('serializes database timestamps from timezone-independent epoch values', () => {
    const assignment = service.presentAssignment(assignmentRow({
      created_at_epoch_ms: Date.parse('2026-08-20T00:00:00.123Z'),
      updated_at_epoch_ms: String(Date.parse('2026-08-20T01:00:00.456Z')),
    }));
    assert.equal(assignment.created_at, '2026-08-20T00:00:00.123Z');
    assert.equal(assignment.updated_at, '2026-08-20T01:00:00.456Z');
    assert.equal(Object.hasOwn(assignment, 'created_at_epoch_ms'), false);
    assert.equal(Object.hasOwn(assignment, 'updated_at_epoch_ms'), false);
  });
});

describe('assignmentService SQL and ownership', () => {
  it('initializes account ownership against the configured student table', async () => {
    const originalTable = process.env.DB_TABLE;
    process.env.DB_TABLE = 'student_records';
    queueQuery(async (sql) => {
      assert.match(sql, /owner_user_id INT UNSIGNED NOT NULL/);
      assert.match(sql, /REFERENCES `student_records` \(id\)/);
      assert.match(sql, /FOREIGN KEY \(owner_user_id\) REFERENCES users \(id\) ON DELETE CASCADE/);
      return [[]];
    });
    queueQuery(async (sql) => {
      assert.match(sql, /INFORMATION_SCHEMA\.COLUMNS/);
      return [[{ COLUMN_NAME: 'owner_user_id' }]];
    });
    queueQuery(async (sql) => {
      assert.match(sql, /HAVING COUNT\(\*\) = 1/);
      assert.match(sql, /assignment\.owner_user_id IS NULL/);
      return [{ affectedRows: 0 }];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /INFORMATION_SCHEMA\.STATISTICS/);
      assert.equal(values.length, 3);
      return [[
        { INDEX_NAME: 'idx_assignments_owner_due' },
        { INDEX_NAME: 'idx_assignments_owner_status_due' },
        { INDEX_NAME: 'idx_assignments_owner_priority_due' },
      ]];
    });
    queueQuery(async (sql) => {
      assert.match(sql, /INFORMATION_SCHEMA\.REFERENTIAL_CONSTRAINTS/);
      assert.match(sql, /DELETE_RULE = 'CASCADE'/);
      return [[{ CONSTRAINT_NAME: 'fk_student_assignments_owner' }]];
    });

    try {
      await service.ensureStudentAssignmentsTable();
    } finally {
      if (originalTable === undefined) delete process.env.DB_TABLE;
      else process.env.DB_TABLE = originalTable;
    }
    assert.equal(implementations.length, 0);
  });

  it('migrates existing assignment tables with nullable legacy rows and owner indexes', async () => {
    queueQuery(async () => [[]]);
    queueQuery(async () => [[]]);
    queueQuery(async (sql) => {
      assert.match(sql, /ADD COLUMN owner_user_id INT UNSIGNED NULL/);
      return [[]];
    });
    queueQuery(async () => [{ affectedRows: 1 }]);
    queueQuery(async () => [[]]);
    for (const indexName of [
      'idx_assignments_owner_due',
      'idx_assignments_owner_status_due',
      'idx_assignments_owner_priority_due',
    ]) {
      queueQuery(async (sql) => {
        assert.match(sql, new RegExp(`ADD INDEX ${indexName}`));
        return [[]];
      });
    }
    queueQuery(async (sql) => {
      assert.match(sql, /INFORMATION_SCHEMA\.REFERENTIAL_CONSTRAINTS/);
      return [[]];
    });
    queueQuery(async (sql) => {
      assert.match(sql, /DELETE assignment/);
      assert.match(sql, /owner\.id IS NULL/);
      return [{ affectedRows: 1 }];
    });
    queueQuery(async (sql) => {
      assert.match(sql, /ADD CONSTRAINT fk_student_assignments_owner/);
      assert.match(sql, /ON DELETE CASCADE/);
      return [[]];
    });

    await service.ensureStudentAssignmentsTable();
    assert.equal(implementations.length, 0);
  });

  it('creates with server-provided ownership and parameterized values', async () => {
    const now = new Date('2026-08-28T10:00:00.000Z');
    queueQuery(async (sql, values) => {
      assert.match(sql, /INSERT INTO student_assignments/);
      assert.ok(sql.includes('VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'));
      assert.deepStrictEqual(values, [
        7,
        99,
        'Private essay',
        'History',
        'private description',
        '2026-09-01 02:00:00.000',
        'Asia/Ho_Chi_Minh',
        'medium',
        'todo',
        null,
      ]);
      assert.ok(!sql.includes('private description'));
      return [{ insertId: 11 }];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /id = \? AND owner_user_id = \? AND student_id = \?/);
      assert.match(sql, /DATE_FORMAT\(due_at/);
      assert.match(sql, /UNIX_TIMESTAMP\(created_at\)/);
      assert.deepStrictEqual(values, [11, 99, 7]);
      return [[assignmentRow({ title: 'Private essay', priority: 'medium' })]];
    });

    const result = await service.createAssignmentForStudent(OWNER, {
      title: '  Private essay  ',
      subject: ' History ',
      description: 'private description',
      due_at: '2026-09-01T09:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
    }, { now });

    assert.equal(result.created, true);
    assert.equal(result.assignment.student_id, 7);
    assert.equal(implementations.length, 0);
    assert.deepStrictEqual(transactionEvents, ['begin', 'commit', 'release']);
  });

  it('sets completed_at from server time when created done', async () => {
    const now = new Date('2026-09-11T00:00:00.123Z');
    queueQuery(async (_sql, values) => {
      assert.equal(values.at(-1), '2026-09-11 00:00:00.123');
      return [{ insertId: 11 }];
    });
    queueQuery(async () => [[assignmentRow({ status: 'done', completed_at: now })]]);

    const result = await service.createAssignmentForStudent(OWNER, {
      title: 'Done work',
      due_at: '2026-09-10T00:00:00Z',
      timezone: 'UTC',
      priority: 'low',
      status: 'done',
    }, { now });
    assert.equal(result.assignment.completed_at, now.toISOString());
  });

  it('rolls back creation when the inserted row cannot be read back', async () => {
    queueQuery(async () => [{ insertId: 11 }]);
    queueQuery(async () => {
      const error = new Error('read-back failed');
      error.code = 'ER_QUERY_FAILED';
      throw error;
    });

    await assert.rejects(
      service.createAssignmentForStudent(OWNER, {
        title: 'Atomic essay',
        due_at: '2026-09-10T00:00Z',
        timezone: 'UTC',
        priority: 'medium',
        status: 'todo',
      }),
      (error) => error.code === 'ER_QUERY_FAILED'
    );
    assert.deepStrictEqual(transactionEvents, ['begin', 'rollback', 'release']);
  });

  it('isolates personal assignments when two accounts share a student record', async () => {
    queueQuery(async (sql, values) => {
      assert.match(sql, /owner_user_id = \?/);
      assert.deepStrictEqual(values, [11, 99, 7]);
      return [[]];
    });
    const result = await service.getAssignmentByIdForStudent(11, OWNER);
    assert.equal(result, null);
  });

  it('lists parameterized filters and calculates a full-result summary', async () => {
    const now = new Date('2026-08-28T00:00:00.000Z');
    queueQuery(async (sql, values) => {
      assert.match(sql, /COUNT\(\*\) AS total/);
      assert.equal(values.at(-1), '2026-08-28 00:00:00.000');
      return [[{ total: 42 }]];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /title LIKE \?/);
      assert.match(sql, /status <> 'done' AND due_at < \?/);
      assert.match(sql, /ORDER BY due_at ASC, id ASC/);
      assert.equal(sql.includes('essay'), false);
      assert.deepStrictEqual(values.slice(-2), [10, 10]);
      return [[assignmentRow()]];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /SUM\(CASE WHEN status = 'todo'/);
      assert.match(sql, /status <> 'done' AND due_at < \?/);
      assert.equal(values[0], '2026-08-28 00:00:00.000');
      return [[{ todo: 18, in_progress: 7, done: 17, overdue: 4 }]];
    });

    const result = await service.listAssignmentsForStudent(OWNER, {
      q: 'essay',
      status: undefined,
      priority: undefined,
      overdue: true,
      from: undefined,
      to: undefined,
      page: 2,
      size: 10,
      sort: 'due_asc',
    }, { now });

    assert.equal(result.assignments.length, 1);
    assert.deepStrictEqual(result.pagination, { page: 2, size: 10, total: 42, totalPages: 5 });
    assert.deepStrictEqual(result.summary, { todo: 18, inProgress: 7, done: 17, overdue: 4 });
    assert.equal(result.asOf, now.toISOString());
    assert.deepStrictEqual(transactionEvents, ['isolation', 'begin', 'commit', 'release']);
  });

  it('rolls back and releases the list snapshot when a query fails', async () => {
    queueQuery(async () => {
      const error = new Error('list failed');
      error.code = 'ER_QUERY_FAILED';
      throw error;
    });

    await assert.rejects(
      service.listAssignmentsForStudent(OWNER, {
        page: 1,
        size: 20,
        sort: 'due_asc',
      }),
      (error) => error.code === 'ER_QUERY_FAILED'
    );
    assert.deepStrictEqual(transactionEvents, ['isolation', 'begin', 'rollback', 'release']);
  });

  it('does not advertise pages beyond the maximum reachable offset', async () => {
    queueQuery(async () => [[{ total: 100101 }]]);
    queueQuery(async (_sql, values) => {
      assert.deepStrictEqual(values.slice(-2), [100, 100000]);
      return [[]];
    });
    queueQuery(async () => [[{ todo: 100101, in_progress: 0, done: 0, overdue: 0 }]]);

    const result = await service.listAssignmentsForStudent(OWNER, {
      page: 1001,
      size: 100,
      sort: 'due_asc',
    });
    assert.deepStrictEqual(result.pagination, {
      page: 1001,
      size: 100,
      total: 100101,
      totalPages: 1001,
    });
  });

  it('clamps a requested page to the filtered result within the same snapshot', async () => {
    queueQuery(async (sql) => {
      assert.match(sql, /COUNT\(\*\) AS total/);
      return [[{ total: 5 }]];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /ORDER BY due_at ASC, id ASC/);
      assert.deepStrictEqual(values.slice(-2), [20, 0]);
      return [[assignmentRow()]];
    });
    queueQuery(async () => [[{ todo: 5, in_progress: 0, done: 0, overdue: 0 }]]);

    const result = await service.listAssignmentsForStudent(OWNER, {
      page: 3,
      size: 20,
      sort: 'due_asc',
    });

    assert.equal(result.assignments.length, 1);
    assert.deepStrictEqual(result.pagination, {
      page: 1,
      size: 20,
      total: 5,
      totalPages: 1,
    });
  });

  it('rejects excessive offsets before querying', async () => {
    await assert.rejects(
      service.listAssignmentsForStudent(OWNER, {
        page: 1002,
        size: 100,
        sort: 'due_asc',
      }),
      (error) => error.code === 'OFFSET_TOO_LARGE'
    );
    assert.equal(calls.length, 0);
  });

  it('deletes only the owned assignment at the expected version', async () => {
    queueQuery(async (sql, values) => {
      assert.match(sql, /FOR UPDATE/);
      assert.deepStrictEqual(values, [11, 99, 7]);
      return [[assignmentRow({ version: 3 })]];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /DELETE FROM student_assignments/);
      assert.match(sql, /owner_user_id = \? AND student_id = \? AND version = \?/);
      assert.deepStrictEqual(values, [11, 99, 7, 3]);
      return [{ affectedRows: 1 }];
    });

    const result = await service.deleteAssignmentForStudent(OWNER, 11, 3);
    assert.deepStrictEqual(result, {
      found: true,
      conflict: false,
      deleted: true,
      assignment: null,
    });
    assert.deepStrictEqual(transactionEvents, ['begin', 'commit', 'release']);
  });

  it('preserves a newer assignment when a stale version requests deletion', async () => {
    queueQuery(async (sql) => {
      assert.match(sql, /FOR UPDATE/);
      return [[assignmentRow({ version: 4 })]];
    });

    const result = await service.deleteAssignmentForStudent(OWNER, 11, 3);
    assert.equal(result.found, true);
    assert.equal(result.conflict, true);
    assert.equal(result.deleted, false);
    assert.equal(result.assignment.version, 4);
    assert.equal(implementations.length, 0);
    assert.deepStrictEqual(transactionEvents, ['begin', 'commit', 'release']);
  });
});

describe('assignmentService status and concurrency rules', () => {
  it('sets server completion time when entering done', async () => {
    const now = new Date('2026-08-28T15:30:00.456Z');
    queueQuery(async (sql) => {
      assert.match(sql, /FOR UPDATE/);
      return [[assignmentRow()]];
    });
    queueQuery(async (sql, values) => {
      assert.match(sql, /completed_at = \?/);
      assert.match(sql, /version = version \+ 1/);
      assert.ok(values.includes('2026-08-28 15:30:00.456'));
      assert.deepStrictEqual(values.slice(-4), [11, 99, 7, 1]);
      return [{ affectedRows: 1 }];
    });
    queueQuery(async () => [[assignmentRow({
      status: 'done',
      completed_at: now,
      version: 2,
    })]]);

    const result = await service.updateAssignmentForStudent(OWNER, 11, { status: 'done' }, 1, { now });
    assert.equal(result.updated, true);
    assert.equal(result.assignment.completed_at, now.toISOString());
    assert.deepStrictEqual(transactionEvents, ['begin', 'commit', 'release']);
  });

  it('preserves original completed_at when done is repeated', async () => {
    const completedAt = new Date('2026-08-25T10:00:00.000Z');
    queueQuery(async () => [[assignmentRow({ status: 'done', completed_at: completedAt })]]);
    queueQuery(async (sql) => {
      assert.doesNotMatch(sql, /completed_at = \?/);
      return [{ affectedRows: 1 }];
    });
    queueQuery(async () => [[assignmentRow({ status: 'done', completed_at: completedAt, version: 2 })]]);

    const result = await service.updateAssignmentForStudent(OWNER, 11, { status: 'done' }, 1);
    assert.equal(result.assignment.completed_at, completedAt.toISOString());
  });

  it('clears completed_at when reopening', async () => {
    queueQuery(async () => [[assignmentRow({
      status: 'done',
      completed_at: new Date('2026-08-25T10:00:00.000Z'),
    })]]);
    queueQuery(async (sql, values) => {
      assert.match(sql, /completed_at = \?/);
      assert.ok(values.includes(null));
      return [{ affectedRows: 1 }];
    });
    queueQuery(async () => [[assignmentRow({ status: 'todo', version: 2 })]]);

    const result = await service.updateAssignmentForStudent(OWNER, 11, { status: 'todo' }, 1);
    assert.equal(result.assignment.completed_at, null);
  });

  it('rolls back an update when its locked read-back fails', async () => {
    queueQuery(async () => [[assignmentRow()]]);
    queueQuery(async () => [{ affectedRows: 1 }]);
    queueQuery(async () => [[]]);

    await assert.rejects(
      service.updateAssignmentForStudent(OWNER, 11, { title: 'Atomic update' }, 1),
      (error) => error.code === 'ASSIGNMENT_READBACK_FAILED'
    );
    assert.deepStrictEqual(transactionEvents, ['begin', 'rollback', 'release']);
  });

  it('requires a completed assignment to be reopened before deadline changes', async () => {
    queueQuery(async () => [[assignmentRow({ status: 'done', completed_at: new Date() })]]);
    const result = await service.updateAssignmentForStudent(OWNER, 11, {
      status: 'todo',
      due_at: '2026-10-01T00:00:00Z',
    }, 1);
    assert.equal(result.reason, 'reopen_before_deadline_change');
    assert.equal(calls.length, 1);
  });

  it('returns a version conflict before applying stale changes', async () => {
    queueQuery(async () => [[assignmentRow({ version: 3 })]]);
    const result = await service.updateAssignmentForStudent(OWNER, 11, { title: 'Stale' }, 2);
    assert.equal(result.conflict, true);
    assert.equal(result.assignment.version, 3);
    assert.equal(calls.length, 1);
  });

  it('detects a concurrent update in the conditional write', async () => {
    queueQuery(async () => [[assignmentRow({ version: 1 })]]);
    queueQuery(async (sql, values) => {
      assert.match(sql, /WHERE id = \? AND owner_user_id = \? AND student_id = \? AND version = \?/);
      assert.deepStrictEqual(values.slice(-4), [11, 99, 7, 1]);
      return [{ affectedRows: 0 }];
    });
    queueQuery(async () => [[assignmentRow({ version: 2, title: 'Newer value' })]]);

    const result = await service.updateAssignmentForStudent(OWNER, 11, { title: 'My value' }, 1);
    assert.equal(result.conflict, true);
    assert.equal(result.assignment.title, 'Newer value');
  });
});
