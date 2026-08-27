/**
 * Study Session Controller — Study Planner (Phase 1) student-only endpoints.
 * Derives student identity from authenticated state; never trusts the body.
 */
let studySessionService = require('../services/studySessionService');
const { logAuditEvent } = require('../services/authService');

function __setStudySessionService(service) {
  studySessionService = service;
}

// Fields a client may set when creating/updating a session.
const CREATE_FIELDS = [
  'title', 'subject', 'starts_at', 'ends_at', 'timezone', 'status', 'actual_minutes', 'completed_at',
];
const UPDATE_FIELDS = [
  'title', 'subject', 'starts_at', 'ends_at', 'timezone', 'status', 'actual_minutes', 'completed_at',
];
const STATUS_FIELDS = ['status', 'actual_minutes'];

const MAX_WINDOW_DAYS = 31;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Reject any request-body keys outside the allowlist.
 * @returns {string|null} first offending key, or null.
 */
function firstUnknownField(body, allowed) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'body';
  return Object.keys(body).find((key) => !allowed.includes(key)) || null;
}

function requireStudentId(req, res) {
  const studentId = req.user && req.user.studentId;
  if (!studentId) {
    res.status(400).json({ error: 'No student record linked to this account.' });
    return null;
  }
  return studentId;
}

function parsePagination(query, res) {
  const rawPage = parseInt(query.page, 10);
  const rawSize = parseInt(query.size, 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const size = Number.isInteger(rawSize) && rawSize > 0
    ? Math.min(rawSize, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  if (Number.isInteger(rawSize) && rawSize > MAX_PAGE_SIZE) {
    res.status(400).json({ error: `size must be at most ${MAX_PAGE_SIZE}` });
    return null;
  }
  return { page, size };
}

/**
 * Parse and validate an optional ISO datetime query bound.
 */
function parseDateBound(value, field, res) {
  if (value === undefined || value === null || value === '') return undefined;
  const instant = studySessionService.parseUtcInstant(value);
  if (!instant) {
    res.status(400).json({ error: `${field} must be a valid datetime with an explicit UTC offset` });
    return Symbol.for('invalid');
  }
  return instant.toISOString();
}

function buildWindow(startDateRaw, endDateRaw, res) {
  let startDate = undefined;
  let endDate = undefined;

  if (startDateRaw !== undefined) {
    const parsedStart = parseDateBound(startDateRaw, 'startDate', res);
    if (parsedStart === Symbol.for('invalid')) return null;
    startDate = parsedStart;
  }
  if (endDateRaw !== undefined) {
    const parsedEnd = parseDateBound(endDateRaw, 'endDate', res);
    if (parsedEnd === Symbol.for('invalid')) return null;
    endDate = parsedEnd;
  }

  // Default to the current Monday-based week in UTC when no bounds are given.
  if (!startDate && !endDate) {
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday
    const daysSinceMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    startDate = monday.toISOString();
    endDate = nextMonday.toISOString();
  } else if (!startDate || !endDate) {
    res.status(400).json({ error: 'Both startDate and endDate must be provided together' });
    return null;
  }

  if (startDate && endDate) {
    const dayDiff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    if (dayDiff > MAX_WINDOW_DAYS) {
      res.status(400).json({ error: `Date window cannot exceed ${MAX_WINDOW_DAYS} days` });
      return null;
    }
    if (dayDiff < 0) {
      res.status(400).json({ error: 'endDate must not be before startDate' });
      return null;
    }
  }

  return { startDate, endDate };
}

/**
 * GET /api/student/me/study-sessions
 * List sessions for the authenticated student within a bounded date window.
 */
async function apiListStudySessions(req, res) {
  try {
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const { startDate, endDate } = req.query;

    const status = req.query.status;
    if (status !== undefined && !studySessionService.VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${studySessionService.VALID_STATUSES.join(', ')}` });
    }

    const subject = req.query.subject;
    if (subject !== undefined) {
      const trimmed = typeof subject === 'string' ? subject.trim() : subject;
      if (typeof trimmed !== 'string' || trimmed.length > 80) {
        return res.status(400).json({ error: 'subject must be at most 80 characters' });
      }
    }

    const pagination = parsePagination(req.query, res);
    if (!pagination) return;

    const windowResult = buildWindow(startDate, endDate, res);
    if (!windowResult) return;

    const sessions = await studySessionService.getStudySessionsByStudent(studentId, {
      startDate: windowResult.startDate,
      endDate: windowResult.endDate,
      status,
      subject,
      page: pagination.page,
      size: pagination.size,
    });

    const total = await studySessionService.countStudySessionsByStudent(studentId, {
      startDate: windowResult.startDate,
      endDate: windowResult.endDate,
      status,
      subject,
    });

    res.json({
      sessions,
      pagination: {
        page: pagination.page,
        size: pagination.size,
        total,
        totalPages: Math.ceil(total / pagination.size),
      },
    });
  } catch (err) {
    console.error('[apiListStudySessions]', err);
    res.status(500).json({ error: 'Failed to load study sessions' });
  }
}

/**
 * GET /api/student/me/study-sessions/summary
 * Full-window weekly summary (aggregate over the whole date window).
 */
async function apiGetStudySessionSummary(req, res) {
  try {
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const { startDate, endDate } = req.query;
    const windowResult = buildWindow(startDate, endDate, res);
    if (!windowResult) return;

    const summary = await studySessionService.getWeeklyStudySessionSummary(studentId, {
      startDate: windowResult.startDate,
      endDate: windowResult.endDate,
    });

    res.json(summary);
  } catch (err) {
    console.error('[apiGetStudySessionSummary]', err);
    res.status(500).json({ error: 'Failed to load weekly summary' });
  }
}

/**
 * POST /api/student/me/study-sessions
 */
async function apiCreateStudySession(req, res) {
  try {
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const unknown = firstUnknownField(req.body, CREATE_FIELDS);
    if (unknown) {
      return res.status(400).json({ error: `Unexpected field: ${unknown}` });
    }

    const {
      title,
      subject,
      starts_at,
      ends_at,
      timezone,
      status = 'planned',
      actual_minutes = null,
      completed_at = null,
    } = req.body;

    const session = await studySessionService.createStudySession({
      studentId,
      title,
      subject,
      startsAt: starts_at,
      endsAt: ends_at,
      timezone,
      status,
      actualMinutes: actual_minutes,
      completedAt: completed_at,
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE_STUDY_SESSION',
      resourceType: 'study_session',
      resourceId: session.id,
      metadata: { studentId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json(session);
  } catch (err) {
    console.error('[apiCreateStudySession]', err);
    if (err.message && err.message.startsWith('Invalid study session data')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create study session' });
  }
}

/**
 * PATCH /api/student/me/study-sessions/:id
 */
async function apiUpdateStudySession(req, res) {
  try {
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const sessionId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const unknown = firstUnknownField(req.body, UPDATE_FIELDS);
    if (unknown) {
      return res.status(400).json({ error: `Unexpected field: ${unknown}` });
    }

    const updates = {
      title: req.body.title,
      subject: req.body.subject,
      starts_at: req.body.starts_at,
      ends_at: req.body.ends_at,
      timezone: req.body.timezone,
      status: req.body.status,
      actual_minutes: req.body.actual_minutes,
      completed_at: req.body.completed_at,
    };

    // Remove undefined so partial updates are honored.
    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) delete updates[key];
    });

    const result = await studySessionService.updateStudySessionForStudent(studentId, sessionId, updates);

    if (!result.found) {
      return res.status(404).json({ error: 'Study session not found' });
    }
    if (!result.updated) {
      return res.status(200).json({ message: 'No changes made', session: result.session });
    }

    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_STUDY_SESSION',
      resourceType: 'study_session',
      resourceId: sessionId,
      metadata: { studentId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json(result.session);
  } catch (err) {
    console.error('[apiUpdateStudySession]', err);
    if (err.message && err.message.startsWith('Invalid study session data')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update study session' });
  }
}

/**
 * PATCH /api/student/me/study-sessions/:id/status
 */
async function apiUpdateStudySessionStatus(req, res) {
  try {
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const sessionId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const unknown = firstUnknownField(req.body, STATUS_FIELDS);
    if (unknown) {
      return res.status(400).json({ error: `Unexpected field: ${unknown}` });
    }

    const { status, actual_minutes } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await studySessionService.transitionStudySessionStatus(studentId, sessionId, status, {
      actualMinutes: actual_minutes,
    });

    if (!result.found) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    if (!result.valid) {
      const messages = {
        invalid_status: 'Status must be one of: planned, completed, skipped',
        actual_minutes_required: 'actual_minutes is required to complete a session',
        invalid_actual_minutes: `actual_minutes must be an integer between ${studySessionService.MIN_ACTUAL_MINUTES} and ${studySessionService.MAX_ACTUAL_MINUTES}`,
        before_start: 'Cannot complete a session before its scheduled start',
      };
      return res.status(400).json({ error: messages[result.reason] || 'Invalid status transition' });
    }

    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_STUDY_SESSION_STATUS',
      resourceType: 'study_session',
      resourceId: sessionId,
      metadata: { studentId, status },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json(result.session);
  } catch (err) {
    console.error('[apiUpdateStudySessionStatus]', err);
    if (err.message && err.message.startsWith('Invalid study session data')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update study session status' });
  }
}

/**
 * DELETE /api/student/me/study-sessions/:id
 */
async function apiDeleteStudySession(req, res) {
  try {
    const studentId = requireStudentId(req, res);
    if (!studentId) return;

    const sessionId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const result = await studySessionService.deleteStudySessionForStudent(studentId, sessionId);

    if (!result.found) {
      return res.status(404).json({ error: 'Study session not found' });
    }
    if (!result.deleted) {
      return res.status(400).json({ error: 'Failed to delete study session' });
    }

    await logAuditEvent({
      userId: req.user.id,
      action: 'DELETE_STUDY_SESSION',
      resourceType: 'study_session',
      resourceId: sessionId,
      metadata: { studentId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Study session deleted successfully' });
  } catch (err) {
    console.error('[apiDeleteStudySession]', err);
    res.status(500).json({ error: 'Failed to delete study session' });
  }
}

module.exports = {
  apiListStudySessions,
  apiGetStudySessionSummary,
  apiCreateStudySession,
  apiUpdateStudySession,
  apiUpdateStudySessionStatus,
  apiDeleteStudySession,
  __setStudySessionService,
};