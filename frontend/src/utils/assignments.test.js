import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ASSIGNMENT_FILTERS,
  applyAssignmentFilterChange,
  assignmentToDraft,
  assignmentWallClockToUtc,
  buildAssignmentDateRange,
  buildAssignmentDeletePath,
  buildAssignmentPayload,
  buildAssignmentQuery,
  computeAssignmentTimeState,
  createLatestAssignmentRequestTracker,
  formatAssignmentDeadline,
  getAssignmentFormStatuses,
  getAssignmentListState,
  getAssignmentStatusTransition,
  getAssignmentTimeZoneOptions,
  getDeadlineRelativeState,
  normalizeAssignmentListResponse,
  preserveAssignmentDraftAfterConflict,
  preserveAssignmentDraftAfterFailure,
  refreshAssignmentTimeStates,
  validateAssignmentDraft,
  validateAssignmentFilterRange,
} from './assignments.js';

function validDraft(overrides = {}) {
  return {
    title: 'Research essay',
    subject: 'History',
    description: 'Write the introduction',
    dueDate: '2026-09-01',
    dueTime: '09:00',
    timezone: 'Asia/Ho_Chi_Minh',
    priority: 'medium',
    status: 'todo',
    version: 3,
    ...overrides,
  };
}

describe('assignment query and response utilities', () => {
  it('serializes supported filters and pagination', () => {
    assert.equal(
      buildAssignmentQuery({
        ...DEFAULT_ASSIGNMENT_FILTERS,
        q: 'essay',
        status: 'todo',
        overdue: 'true',
        sort: 'due_desc',
      }, { page: 2, size: 10 }),
      '?q=essay&status=todo&overdue=true&sort=due_desc&page=2&size=10'
    );
  });

  it('serializes version-checked assignment deletion paths', () => {
    assert.equal(
      buildAssignmentDeletePath({ id: 11, version: 3 }),
      '/student/me/assignments/11?version=3'
    );
    assert.equal(buildAssignmentDeletePath({ id: 11, version: 0 }), null);
    assert.equal(buildAssignmentDeletePath({ id: 'invalid', version: 3 }), null);
  });

  it('resets pagination when filters change', () => {
    assert.deepStrictEqual(
      applyAssignmentFilterChange(DEFAULT_ASSIGNMENT_FILTERS, { priority: 'high' }),
      { filters: { ...DEFAULT_ASSIGNMENT_FILTERS, priority: 'high' }, page: 1 }
    );
  });

  it('converts inclusive viewing dates into a half-open UTC range', () => {
    const range = buildAssignmentDateRange({
      ...DEFAULT_ASSIGNMENT_FILTERS,
      from: '2026-09-01',
      to: '2026-09-02',
    }, 'Asia/Ho_Chi_Minh');
    assert.equal(range.from, '2026-08-31T17:00:00.000Z');
    assert.equal(range.to, '2026-09-02T17:00:00.000Z');
  });

  it('rejects reversed and excessive date filter ranges before requesting', () => {
    assert.equal(validateAssignmentFilterRange({
      from: '2026-09-02',
      to: '2026-09-01',
    }, 'UTC'), 'dateRangeReversed');
    assert.equal(validateAssignmentFilterRange({
      from: '2026-01-01',
      to: '2027-01-02',
    }, 'UTC'), 'dateRangeTooLong');
    assert.equal(validateAssignmentFilterRange({
      from: '2026-01-01',
      to: '2026-12-31',
    }, 'UTC'), null);
  });

  it('rejects invalid single boundaries and never emits offset-less fallback dates', () => {
    assert.equal(validateAssignmentFilterRange({
      from: '2011-12-30',
      to: '',
    }, 'Pacific/Apia'), 'invalidDateRange');
    assert.equal(validateAssignmentFilterRange({
      from: '',
      to: '2011-12-29',
    }, 'Pacific/Apia'), 'invalidDateRange');
    assert.equal(buildAssignmentDateRange({
      from: '2011-12-30',
      to: '',
    }, 'Pacific/Apia'), null);
    assert.equal(validateAssignmentFilterRange({
      from: '2026-09-01',
      to: '',
    }, 'UTC'), null);
  });

  it('distinguishes loading, empty, no-results, error, and ready states', () => {
    assert.equal(getAssignmentListState({ loading: true }), 'loading');
    assert.equal(getAssignmentListState({ error: 'failed', assignments: [] }), 'error');
    assert.equal(getAssignmentListState({ assignments: [], hasFilters: false }), 'empty');
    assert.equal(getAssignmentListState({ assignments: [], hasFilters: true }), 'noResults');
    assert.equal(getAssignmentListState({ assignments: [{}], hasFilters: true }), 'ready');
  });

  it('preserves draft data after a failed request', () => {
    const state = { draft: validDraft(), submitting: true, submitError: '' };
    const failed = preserveAssignmentDraftAfterFailure(state, 'Request failed');
    assert.strictEqual(failed.draft, state.draft);
    assert.equal(failed.submitting, false);
    assert.equal(failed.submitError, 'Request failed');
  });

  it('retains a conflicted draft but prevents blind resubmission', () => {
    const state = { draft: validDraft(), submitting: true, submitError: '', conflicted: false };
    const failed = preserveAssignmentDraftAfterConflict(state, 'Changed elsewhere');
    assert.strictEqual(failed.draft, state.draft);
    assert.equal(failed.submitting, false);
    assert.equal(failed.submitError, 'Changed elsewhere');
    assert.equal(failed.conflicted, true);
  });

  it('honors a server pagination cap instead of advertising unreachable pages', () => {
    const normalized = normalizeAssignmentListResponse({
      assignments: [],
      pagination: { page: 1001, size: 100, total: 100101, totalPages: 1001 },
      summary: {},
      asOf: '2026-08-28T00:00:00.000Z',
    }, 1001, 100);
    assert.deepStrictEqual(normalized.pagination, {
      page: 1001,
      size: 100,
      total: 100101,
      totalPages: 1001,
    });
  });

  it('normalizes malformed list response values without NaN or invalid pages', () => {
    const normalized = normalizeAssignmentListResponse({
      assignments: null,
      pagination: { page: 99, size: 10, total: 12 },
      summary: { todo: '4', inProgress: undefined, done: -2, overdue: '3' },
      asOf: 'invalid',
    }, 1, 20);
    assert.deepStrictEqual(normalized.assignments, []);
    assert.deepStrictEqual(normalized.pagination, { page: 2, size: 10, total: 12, totalPages: 2 });
    assert.deepStrictEqual(normalized.summary, { todo: 4, inProgress: 0, done: 0, overdue: 3 });
    assert.ok(!Number.isNaN(new Date(normalized.asOf).getTime()));
  });
});

describe('assignment form and deadline conversion', () => {
  it('keeps UTC and valid current aliases in timezone options', () => {
    assert.deepStrictEqual(
      getAssignmentTimeZoneOptions(
        ['Asia/Ho_Chi_Minh', 'UTC', 'Invalid/Nowhere'],
        ['America/New_York']
      ),
      ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York']
    );
  });

  it('allows unfinished edits between todo and in-progress without exposing done', () => {
    assert.deepStrictEqual(getAssignmentFormStatuses('edit', 'in_progress'), ['todo', 'in_progress']);
    assert.deepStrictEqual(getAssignmentFormStatuses('edit', 'todo'), ['todo', 'in_progress']);
    assert.deepStrictEqual(getAssignmentFormStatuses('edit', 'done'), ['done']);
    assert.deepStrictEqual(getAssignmentFormStatuses('create', null), ['todo', 'in_progress', 'done']);
  });

  it('validates required and bounded form fields', () => {
    const errors = validateAssignmentDraft(validDraft({
      title: '',
      subject: 's'.repeat(81),
      description: 'd'.repeat(2001),
      dueDate: '',
      dueTime: '',
      timezone: 'Invalid/Nowhere',
      priority: 'urgent',
      status: 'overdue',
    }));
    assert.deepStrictEqual(errors, {
      title: 'required',
      subject: 'subjectTooLong',
      description: 'descriptionTooLong',
      dueDate: 'required',
      dueTime: 'required',
      timezone: 'invalidTimezone',
      priority: 'invalidPriority',
      status: 'invalidStatus',
    });
  });

  it('rejects impossible dates, unsupported years, and daylight-saving gaps', () => {
    assert.equal(assignmentWallClockToUtc('2026-02-30', '10:00', 'UTC'), null);
    assert.equal(assignmentWallClockToUtc('0999-12-31', '23:59', 'UTC'), null);
    assert.equal(assignmentWallClockToUtc('2027-03-14', '02:30', 'America/New_York'), null);
  });

  it('converts wall-clock deadlines to explicit UTC and includes optimistic version', () => {
    const payload = buildAssignmentPayload(validDraft(), { includeVersion: true });
    assert.deepStrictEqual(payload, {
      title: 'Research essay',
      subject: 'History',
      description: 'Write the introduction',
      due_at: '2026-09-01T02:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      priority: 'medium',
      status: 'todo',
      version: 3,
    });
  });

  it('round-trips an assignment deadline in its viewing timezone', () => {
    const draft = assignmentToDraft({
      title: 'Essay',
      due_at: '2026-09-01T02:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      priority: 'high',
      status: 'in_progress',
      version: 4,
    });
    assert.equal(draft.dueDate, '2026-09-01');
    assert.equal(draft.dueTime, '09:00');
    assert.equal(draft.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(draft.version, 4);
  });

  it('formats the exact deadline and timezone together', () => {
    const formatted = formatAssignmentDeadline(
      '2026-07-01T14:00:00.000Z',
      'America/New_York',
      'en-US'
    );
    assert.match(formatted, /Jul 1, 2026/);
    assert.match(formatted, /10:00 AM/);
    assert.match(formatted, /EDT/);
  });
});

describe('assignment time refresh and stale request handling', () => {
  it('requires confirmations for completion and reopening status actions', () => {
    assert.deepStrictEqual(
      getAssignmentStatusTransition({ status: 'in_progress' }, 'done'),
      { allowed: true, requiresConfirmation: true, confirmation: 'complete' }
    );
    assert.deepStrictEqual(
      getAssignmentStatusTransition({ status: 'done' }, 'todo'),
      { allowed: true, requiresConfirmation: true, confirmation: 'reopen' }
    );
    assert.deepStrictEqual(
      getAssignmentStatusTransition({ status: 'todo' }, 'in_progress'),
      { allowed: true, requiresConfirmation: false, confirmation: null }
    );
  });

  it('refreshes overdue when fake time crosses the deadline', (context) => {
    context.mock.timers.enable({
      apis: ['Date'],
      now: new Date('2026-09-01T09:59:00.000Z'),
    });
    const assignment = { due_at: '2026-09-01T10:00:00.000Z', status: 'todo' };
    assert.equal(computeAssignmentTimeState(assignment, new Date()).isOverdue, false);

    context.mock.timers.tick(2 * 60 * 1000);
    const [refreshed] = refreshAssignmentTimeStates([assignment], new Date());
    assert.equal(refreshed.isOverdue, true);
  });

  it('keeps overdue as a subset of unfinished work and computes completed-late', () => {
    const now = new Date('2026-09-01T11:00:00.000Z');
    assert.deepStrictEqual(computeAssignmentTimeState({
      status: 'done',
      due_at: '2026-09-01T10:00:00.000Z',
      completed_at: '2026-09-01T10:30:00.000Z',
    }, now), { isOverdue: false, completedLate: true });
  });

  it('produces deterministic relative deadline labels', () => {
    const now = new Date('2026-09-01T10:00:00.000Z');
    assert.deepStrictEqual(
      getDeadlineRelativeState('2026-09-01T12:00:00.000Z', now),
      { key: 'hoursRemaining', count: 2 }
    );
    assert.deepStrictEqual(
      getDeadlineRelativeState('2026-08-30T10:00:00.000Z', now),
      { key: 'daysOverdue', count: 2 }
    );
  });

  it('ignores stale list completions', () => {
    const tracker = createLatestAssignmentRequestTracker();
    const first = tracker.begin();
    const second = tracker.begin();
    assert.equal(tracker.isCurrent(first), false);
    assert.equal(tracker.isCurrent(second), true);
    tracker.invalidate();
    assert.equal(tracker.isCurrent(second), false);
  });
});
