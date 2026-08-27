/**
 * Study Session Controller — Handles study sessions for students.
 * All endpoints require student authentication and proper authorization.
 */
const studySessionService = require('../services/studySessionService');
const { logAuditEvent } = require('../services/authService');

/**
 * GET /api/student/me/study-sessions
 * List study sessions for the authenticated student with optional filtering.
 */
async function apiListStudySessions(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const { startDate, endDate, status, page, size } = req.query;

    // Validate date window (max 31 days)
    let validatedStartDate = null;
    let validatedEndDate = null;

    if (startDate) {
      validatedStartDate = new Date(startDate);
      if (isNaN(validatedStartDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
    }

    if (endDate) {
      validatedEndDate = new Date(endDate);
      if (isNaN(validatedEndDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
    }

    // If no dates provided, default to current week (Monday to Sunday)
    if (!validatedStartDate && !validatedEndDate) {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Monday
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7); // Next Monday
      endOfWeek.setHours(0, 0, 0, 0);

      validatedStartDate = startOfWeek;
      validatedEndDate = endOfWeek;
    }

    // Enforce max 31-day window
    if (validatedStartDate && validatedEndDate) {
      const timeDiff = validatedEndDate.getTime() - validatedStartDate.getTime();
      const dayDiff = timeDiff / (1000 * 60 * 60 * 24);
      if (dayDiff > 31) {
        return res.status(400).json({ error: 'Date window cannot exceed 31 days' });
      }
    }

    // Parse pagination
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 20;

    // Get sessions
    const sessions = await studySessionService.getStudySessionsByStudent(studentId, {
      startDate: validatedStartDate ? validatedStartDate.toISOString() : null,
      endDate: validatedEndDate ? validatedEndDate.toISOString() : null,
      status,
      page: pageNum,
      size: sizeNum
    });

    // Get total count for pagination
    const total = await studySessionService.countStudySessionsByStudent(studentId, {
      startDate: validatedStartDate ? validatedStartDate.toISOString() : null,
      endDate: validatedEndDate ? validatedEndDate.toISOString() : null,
      status
    });

    res.json({
      sessions,
      pagination: {
        page: pageNum,
        size: sizeNum,
        total,
        totalPages: Math.ceil(total / sizeNum)
      }
    });
  } catch (err) {
    console.error('[apiListStudySessions]', err);
    res.status(500).json({ error: 'Failed to load study sessions' });
  }
}

/**
 * POST /api/student/me/study-sessions
 * Create a new study session for the authenticated student.
 */
async function apiCreateStudySession(req, res) {
  try {
    const studentId = req.user.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    const {
      title,
      subject,
      starts_at,
      ends_at,
      timezone,
      status = 'planned',
      actual_minutes,
      completed_at
    } = req.body;

    // Create the session
    const session = await studySessionService.createStudySession({
      studentId,
      title,
      subject,
      starts_at,
      ends_at,
      timezone,
      status,
      actual_minutes,
      completed_at
    });

    // Log audit event
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
 * Update a study session for the authenticated student.
 */
async function apiUpdateStudySession(req, res) {
  try {
    const studentId = req.user.studentId;
    const sessionId = parseInt(req.params.id, 10);

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const {
      title,
      subject,
      starts_at,
      ends_at,
      timezone,
      status,
      actual_minutes,
      completed_at
    } = req.body;

    // Update the session
    const result = await studySessionService.updateStudySessionForStudent(
      studentId,
      sessionId,
      {
        title,
        subject,
        starts_at,
        ends_at,
        timezone,
        status,
        actual_minutes,
        completed_at
      }
    );

    if (!result.found) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    if (!result.updated) {
      return res.status(200).json({ message: 'No changes made' });
    }

    // Get updated session
    const updatedSession = await studySessionService.getStudySessionByIdForStudent(sessionId, studentId);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_STUDY_SESSION',
      resourceType: 'study_session',
      resourceId: sessionId,
      metadata: { studentId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json(updatedSession);
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
 * Update only the status of a study session for the authenticated student.
 */
async function apiUpdateStudySessionStatus(req, res) {
  try {
    const studentId = req.user.studentId;
    const sessionId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Validate status
    const validStatuses = ['planned', 'completed', 'skipped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status must be one of: planned, completed, skipped' });
    }

    // Get current session to validate transitions
    const currentSession = await studySessionService.getStudySessionByIdForStudent(sessionId, studentId);
    if (!currentSession) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    // Validate status transition
    const updateData = { ...currentSession, status };
    const validationErrors = studySessionService.validateStudySessionData(updateData);
    if (validationErrors.length) {
      return res.status(400).json({ error: validationErrors[0] });
    }

    // Additional business logic for status transitions
    if (status === 'completed') {
      // Completing a session requires actual minutes
      if (!req.body.actual_minutes && req.body.actual_minutes !== 0) {
        return res.status(400).json({ error: 'actual_minutes is required to complete a session' });
      }

      // A session cannot be completed before its scheduled start
      const now = new Date();
      const startsAt = new Date(currentSession.starts_at);
      if (now < startsAt) {
        return res.status(400).json({ error: 'Cannot complete a session before its scheduled start' });
      }
    }

    if (status === 'planned' && ['completed', 'skipped'].includes(currentSession.status)) {
      // Reopening clears actual minutes and completed timestamp
      updateData.actual_minutes = null;
      updateData.completed_at = null;
    }

    // Update the session
    const result = await studySessionService.updateStudySessionForStudent(
      studentId,
      sessionId,
      updateData
    );

    if (!result.found) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    if (!result.updated) {
      return res.status(200).json({ message: 'No changes made' });
    }

    // Get updated session
    const updatedSession = await studySessionService.getStudySessionByIdForStudent(sessionId, studentId);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_STUDY_SESSION_STATUS',
      resourceType: 'study_session',
      resourceId: sessionId,
      metadata: { studentId, status },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json(updatedSession);
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
 * Delete a study session for the authenticated student.
 */
async function apiDeleteStudySession(req, res) {
  try {
    const studentId = req.user.studentId;
    const sessionId = parseInt(req.params.id, 10);

    if (!studentId) {
      return res.status(400).json({ error: 'No student record linked to this account.' });
    }

    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    // Delete the session
    const result = await studySessionService.deleteStudySessionForStudent(studentId, sessionId);

    if (!result.found) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    if (!result.deleted) {
      return res.status(400).json({ error: 'Failed to delete study session' });
    }

    // Log audit event
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
  apiCreateStudySession,
  apiUpdateStudySession,
  apiUpdateStudySessionStatus,
  apiDeleteStudySession
};