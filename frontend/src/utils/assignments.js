export const ASSIGNMENT_STATUSES = ['todo', 'in_progress', 'done'];
export const ASSIGNMENT_PRIORITIES = ['low', 'medium', 'high'];
export const ASSIGNMENT_SORTS = ['due_asc', 'due_desc', 'created_desc', 'priority_desc', 'title_asc'];

export const DEFAULT_ASSIGNMENT_FILTERS = Object.freeze({
  q: '',
  subject: '',
  status: '',
  priority: '',
  overdue: '',
  from: '',
  to: '',
  sort: 'due_asc',
});

function nextAssignmentCivilDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const current = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000
    || year > 9999
    || current.getUTCFullYear() !== year
    || current.getUTCMonth() !== month - 1
    || current.getUTCDate() !== day
  ) return null;

  current.setUTCDate(current.getUTCDate() + 1);
  if (current.getUTCFullYear() > 9999) return null;
  return [
    current.getUTCFullYear(),
    String(current.getUTCMonth() + 1).padStart(2, '0'),
    String(current.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function buildAssignmentDateRange(filters, timeZone) {
  const normalized = { ...(filters || {}) };
  if (normalized.from) {
    const from = assignmentWallClockToUtc(normalized.from, '00:00', timeZone);
    if (!from) return null;
    normalized.from = from.toISOString();
  }
  if (normalized.to) {
    const nextDate = nextAssignmentCivilDate(normalized.to);
    if (!nextDate) return null;
    const exclusiveTo = assignmentWallClockToUtc(nextDate, '00:00', timeZone);
    if (!exclusiveTo) return null;
    normalized.to = exclusiveTo.toISOString();
  }
  return normalized;
}

export function buildAssignmentQuery(filters, { page = 1, size = 20 } = {}) {
  const query = new URLSearchParams();
  const values = { ...DEFAULT_ASSIGNMENT_FILTERS, ...(filters || {}) };
  for (const key of ['q', 'subject', 'status', 'priority', 'overdue', 'from', 'to', 'sort']) {
    const value = values[key];
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  query.set('page', String(page));
  query.set('size', String(size));
  return `?${query.toString()}`;
}

export function buildAssignmentDeletePath(assignment) {
  const id = Number(assignment?.id);
  const version = Number(assignment?.version);
  if (
    !Number.isSafeInteger(id)
    || id < 1
    || !Number.isSafeInteger(version)
    || version < 1
  ) return null;

  const query = new URLSearchParams({ version: String(version) });
  return `/student/me/assignments/${id}?${query.toString()}`;
}

export function applyAssignmentFilterChange(currentFilters, changes) {
  return {
    filters: { ...currentFilters, ...changes },
    page: 1,
  };
}

export function validateAssignmentFilterRange(filters, timeZone, maxDays = 366) {
  const fromValue = filters?.from || '';
  const toValue = filters?.to || '';
  if (!fromValue && !toValue) return null;

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if ((fromValue && !datePattern.test(fromValue)) || (toValue && !datePattern.test(toValue))) {
    return 'invalidDateRange';
  }

  const from = fromValue ? assignmentWallClockToUtc(fromValue, '00:00', timeZone) : null;
  const inclusiveTo = toValue ? assignmentWallClockToUtc(toValue, '00:00', timeZone) : null;
  if ((fromValue && !from) || (toValue && !inclusiveTo)) return 'invalidDateRange';
  if (from && inclusiveTo && inclusiveTo.getTime() < from.getTime()) return 'dateRangeReversed';

  const apiRange = buildAssignmentDateRange(filters, timeZone);
  if (!apiRange) return 'invalidDateRange';
  if (from && toValue) {
    const exclusiveTo = parseAssignmentInstant(apiRange.to);
    if (!exclusiveTo) return 'invalidDateRange';
    if (exclusiveTo.getTime() - from.getTime() > maxDays * 24 * 60 * 60 * 1000) {
      return 'dateRangeTooLong';
    }
  }
  return null;
}

export function parseAssignmentInstant(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  let normalized = value.trim();
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(normalized)) {
    normalized = `${normalized.replace(' ', 'T')}Z`;
  } else if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    return null;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidAssignmentTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function getAssignmentTimeZoneOptions(currentValues = [], supportedValues) {
  let supported = supportedValues;
  if (!Array.isArray(supported)) {
    try {
      supported = Intl.supportedValuesOf('timeZone');
    } catch {
      supported = ['Asia/Ho_Chi_Minh', 'America/New_York', 'Europe/London'];
    }
  }

  const current = Array.isArray(currentValues) ? currentValues : [currentValues];
  const seen = new Set();
  return ['UTC', ...current, ...supported].filter((timeZone) => {
    if (!isValidAssignmentTimeZone(timeZone) || seen.has(timeZone)) return false;
    seen.add(timeZone);
    return true;
  });
}

export function getAssignmentFormStatuses(mode, currentStatus) {
  if (mode !== 'edit') return [...ASSIGNMENT_STATUSES];
  if (currentStatus === 'done') return ['done'];
  return ['todo', 'in_progress'];
}

export function getAssignmentTimeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  ) - date.getTime();
}

export function assignmentWallClockToUtc(dateOnly, timeOnly, timeZone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || '').trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeOnly || '').trim());
  if (!dateMatch || !timeMatch || !isValidAssignmentTimeZone(timeZone)) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(naiveUtc);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) return null;

  try {
    let resolved = naiveUtc - getAssignmentTimeZoneOffsetMs(timeZone, normalized);
    resolved = naiveUtc - getAssignmentTimeZoneOffsetMs(timeZone, new Date(resolved));
    const result = new Date(resolved);
    if (Number.isNaN(result.getTime())) return null;

    // Reject DST gaps by verifying the requested wall-clock values round-trip.
    const actual = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(result).reduce((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
    if (
      Number(actual.year) !== year
      || Number(actual.month) !== month
      || Number(actual.day) !== day
      || Number(actual.hour) % 24 !== hour
      || Number(actual.minute) !== minute
    ) return null;

    return result;
  } catch {
    return null;
  }
}

export function validateAssignmentDraft(draft) {
  const errors = {};
  const title = typeof draft?.title === 'string' ? draft.title.trim() : '';
  const subject = typeof draft?.subject === 'string' ? draft.subject.trim() : '';
  const description = typeof draft?.description === 'string' ? draft.description : '';

  if (!title) errors.title = 'required';
  else if (title.length > 160) errors.title = 'titleTooLong';
  if (subject.length > 80) errors.subject = 'subjectTooLong';
  if (description.length > 2000) errors.description = 'descriptionTooLong';
  if (!draft?.dueDate) errors.dueDate = 'required';
  if (!draft?.dueTime) errors.dueTime = 'required';
  if (!isValidAssignmentTimeZone(draft?.timezone)) errors.timezone = 'invalidTimezone';
  if (!ASSIGNMENT_PRIORITIES.includes(draft?.priority)) errors.priority = 'invalidPriority';
  if (!ASSIGNMENT_STATUSES.includes(draft?.status)) errors.status = 'invalidStatus';

  if (!errors.dueDate && !errors.dueTime && !errors.timezone) {
    if (!assignmentWallClockToUtc(draft.dueDate, draft.dueTime, draft.timezone)) {
      errors.dueDate = 'invalidDeadline';
    }
  }
  return errors;
}

export function buildAssignmentPayload(draft, { includeVersion = false } = {}) {
  const dueAt = assignmentWallClockToUtc(draft.dueDate, draft.dueTime, draft.timezone);
  if (!dueAt) return null;
  const payload = {
    title: draft.title.trim(),
    subject: draft.subject.trim() || null,
    description: draft.description.trim() || null,
    due_at: dueAt.toISOString(),
    timezone: draft.timezone,
    priority: draft.priority,
    status: draft.status,
  };
  if (includeVersion) payload.version = draft.version;
  return payload;
}

export function assignmentToDraft(assignment, fallbackTimeZone = 'UTC') {
  const dueAt = parseAssignmentInstant(assignment?.due_at);
  const timezone = isValidAssignmentTimeZone(assignment?.timezone)
    ? assignment.timezone
    : fallbackTimeZone;
  let dateParts = {};
  if (dueAt) {
    dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(dueAt).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  }
  return {
    title: assignment?.title || '',
    subject: assignment?.subject || '',
    description: assignment?.description || '',
    dueDate: dueAt ? `${dateParts.year}-${dateParts.month}-${dateParts.day}` : '',
    dueTime: dueAt ? `${String(Number(dateParts.hour) % 24).padStart(2, '0')}:${dateParts.minute}` : '',
    timezone,
    priority: ASSIGNMENT_PRIORITIES.includes(assignment?.priority) ? assignment.priority : 'medium',
    status: ASSIGNMENT_STATUSES.includes(assignment?.status) ? assignment.status : 'todo',
    version: Number(assignment?.version) || 1,
  };
}

export function getAssignmentStatusTransition(assignment, targetStatus) {
  const currentStatus = assignment?.status;
  if (!ASSIGNMENT_STATUSES.includes(currentStatus) || !ASSIGNMENT_STATUSES.includes(targetStatus)) {
    return { allowed: false, requiresConfirmation: false, confirmation: null };
  }
  if (currentStatus === targetStatus) {
    return { allowed: false, requiresConfirmation: false, confirmation: null };
  }
  if (targetStatus === 'done') {
    return { allowed: true, requiresConfirmation: true, confirmation: 'complete' };
  }
  if (currentStatus === 'done') {
    return { allowed: true, requiresConfirmation: true, confirmation: 'reopen' };
  }
  return { allowed: true, requiresConfirmation: false, confirmation: null };
}

export function computeAssignmentTimeState(assignment, asOf = new Date()) {
  const dueAt = parseAssignmentInstant(assignment?.due_at);
  const completedAt = parseAssignmentInstant(assignment?.completed_at);
  const now = parseAssignmentInstant(asOf) || (asOf instanceof Date ? asOf : new Date());
  return {
    isOverdue: assignment?.status !== 'done' && Boolean(dueAt && dueAt.getTime() < now.getTime()),
    completedLate: assignment?.status === 'done'
      && Boolean(completedAt && dueAt && completedAt.getTime() > dueAt.getTime()),
  };
}

export function refreshAssignmentTimeStates(assignments, asOf = new Date()) {
  return (Array.isArray(assignments) ? assignments : []).map((assignment) => ({
    ...assignment,
    ...computeAssignmentTimeState(assignment, asOf),
  }));
}

export function getDeadlineRelativeState(dueValue, asOf = new Date()) {
  const dueAt = parseAssignmentInstant(dueValue);
  const now = parseAssignmentInstant(asOf) || (asOf instanceof Date ? asOf : null);
  if (!dueAt || !now || Number.isNaN(now.getTime())) return { key: 'invalidDeadline', count: 0 };
  const difference = dueAt.getTime() - now.getTime();
  const absoluteMinutes = Math.ceil(Math.abs(difference) / 60000);
  if (absoluteMinutes < 1) return { key: 'dueNow', count: 0 };
  if (absoluteMinutes < 60) return { key: difference < 0 ? 'minutesOverdue' : 'minutesRemaining', count: absoluteMinutes };
  const absoluteHours = Math.ceil(absoluteMinutes / 60);
  if (absoluteHours < 24) return { key: difference < 0 ? 'hoursOverdue' : 'hoursRemaining', count: absoluteHours };
  const absoluteDays = Math.ceil(absoluteHours / 24);
  return { key: difference < 0 ? 'daysOverdue' : 'daysRemaining', count: absoluteDays };
}

export function formatAssignmentDeadline(value, timeZone, locale = 'en-US') {
  const date = parseAssignmentInstant(value);
  if (!date || !isValidAssignmentTimeZone(timeZone)) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function normalizeAssignmentListResponse(response, requestedPage = 1, requestedSize = 20) {
  const assignments = Array.isArray(response?.assignments) ? response.assignments : [];
  const total = Number.isSafeInteger(Number(response?.pagination?.total)) && Number(response.pagination.total) >= 0
    ? Number(response.pagination.total)
    : 0;
  const size = Number.isSafeInteger(Number(response?.pagination?.size)) && Number(response.pagination.size) > 0
    ? Number(response.pagination.size)
    : requestedSize;
  const calculatedTotalPages = total === 0 ? 0 : Math.ceil(total / size);
  const reportedTotalPages = Number(response?.pagination?.totalPages);
  const totalPages = calculatedTotalPages === 0
    ? 0
    : Number.isSafeInteger(reportedTotalPages) && reportedTotalPages >= 1
      ? Math.min(calculatedTotalPages, reportedTotalPages)
      : calculatedTotalPages;
  const page = totalPages === 0
    ? 1
    : Math.min(Math.max(1, Number(response?.pagination?.page) || requestedPage), totalPages);
  return {
    assignments,
    pagination: { page, size, total, totalPages },
    summary: {
      todo: Math.max(0, Number(response?.summary?.todo) || 0),
      inProgress: Math.max(0, Number(response?.summary?.inProgress) || 0),
      done: Math.max(0, Number(response?.summary?.done) || 0),
      overdue: Math.max(0, Number(response?.summary?.overdue) || 0),
    },
    asOf: parseAssignmentInstant(response?.asOf)?.toISOString() || new Date().toISOString(),
  };
}

export function getAssignmentListState({ loading, error, assignments, hasFilters }) {
  if (loading) return 'loading';
  if (error) return 'error';
  if (Array.isArray(assignments) && assignments.length > 0) return 'ready';
  return hasFilters ? 'noResults' : 'empty';
}

export function preserveAssignmentDraftAfterFailure(formState, errorMessage) {
  return {
    ...formState,
    submitting: false,
    submitError: errorMessage,
  };
}

export function preserveAssignmentDraftAfterConflict(formState, errorMessage) {
  return {
    ...preserveAssignmentDraftAfterFailure(formState, errorMessage),
    conflicted: true,
  };
}

export function createLatestAssignmentRequestTracker() {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(requestId) {
      return requestId === current;
    },
    invalidate() {
      current += 1;
    },
  };
}
