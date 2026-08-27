'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const studySessionController = require('./studySessionController');
const studySessionService = require('../services/studySessionService');

// Mock the service and audit log
const studySessionServiceMock = {
  getStudySessionsByStudent: async () => [],
  countStudySessionsByStudent: async () => 0,
  getWeeklyStudySessionSummary: async () => ({}),
  createStudySession: async () => ({}),
  updateStudySessionForStudent: async () => ({ found: true, updated: true, session: {} }),
  transitionStudySessionStatus: async () => ({ found: true, valid: true, session: {} }),
  deleteStudySessionForStudent: async () => ({ found: true, deleted: true })
};

const logAuditEventMock = async () => {};

let originalStudySessionService;
let originalLogAuditEvent;

beforeEach(() => {
  originalStudySessionService = require('../services/studySessionService');
  // Set up the mock service with the required constants
  studySessionServiceMock.VALID_STATUSES = ['planned', 'completed', 'skipped'];
  studySessionServiceMock.MIN_ACTUAL_MINUTES = 1;
  studySessionServiceMock.MAX_ACTUAL_MINUTES = 720;
  studySessionServiceMock.parseUtcInstant = (value) => {
    if (value === "invalid") return null;
    if (value === "2023-01-01T00:00:00Z") return new Date("2023-01-01T00:00:00Z");
    if (value === "2023-02-01T00:00:00Z") return new Date("2023-02-01T00:00:00Z");
    return new Date(value);
  };
  studySessionController.__setStudySessionService(studySessionServiceMock);
  originalLogAuditEvent = studySessionController.logAuditEvent;
  studySessionController.logAuditEvent = logAuditEventMock;
});

afterEach(() => {
  studySessionController.__setStudySessionService(originalStudySessionService);
  studySessionController.logAuditEvent = originalLogAuditEvent;
});

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
    }
  };
}

function createRequest(userOverrides = {}, queryOverrides = {}, bodyOverrides = {}, paramsOverrides = {}) {
  return {
    user: { id: 101, studentId: 1, ...userOverrides },
    query: { ...queryOverrides },
    body: { ...bodyOverrides },
    params: { ...paramsOverrides },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' }
  };
}

describe('StudySessionController', () => {
  describe('apiListStudySessions', () => {
    it('should return 400 if no studentId', async () => {
      const req = createRequest({ userOverrides: { studentId: null } });
      const res = createResponse();

      await studySessionController.apiListStudySessions(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'No student record linked to this account.' });
    });

    it('should return 400 for invalid status', async () => {
      const req = createRequest({}, { status: 'invalid' });
      const res = createResponse();

      await studySessionController.apiListStudySessions(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /status must be one of/);
    });

    it('should return 400 for subject too long', async () => {
      const req = createRequest({}, {}, { subject: 'A'.repeat(81) });
      const res = createResponse();

      await studySessionController.apiListStudySessions(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /subject must be at most 80 characters/);
    });

    it('should return 400 for invalid startDate', async () => {
      const req = createRequest({}, { startDate: 'invalid' });
      const res = createResponse();

      await studySessionController.apiListStudySessions(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /startDate must be a valid datetime/);
    });

    it('should return 400 for date window too large', async () => {
      const req = createRequest({}, { startDate: '2023-01-01T00:00:00Z', endDate: '2023-02-01T00:00:00Z' }); // 31 days
      const res = createResponse();

      await studySessionController.apiListStudySessions(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Date window cannot exceed 31 days/);
    });

    it('should call service and return sessions', async () => {
      const mockSessions = [{ id: 1, title: 'Test' }];
      studySessionServiceMock.getStudySessionsByStudent = async () => mockSessions;
      studySessionServiceMock.countStudySessionsByStudent = async () => 1;

      const req = createRequest();
      const res = createResponse();

      await studySessionController.apiListStudySessions(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, {
        sessions: mockSessions,
        pagination: {
          page: 1,
          size: 20,
          total: 1,
          totalPages: 1
        }
      });
    });
  });

  describe('apiGetStudySessionSummary', () => {
    it('should return 400 if no studentId', async () => {
      const req = createRequest({ userOverrides: { studentId: null } });
      const res = createResponse();

      await studySessionController.apiGetStudySessionSummary(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'No student record linked to this account.' });
    });

    it('should return 400 for invalid startDate', async () => {
      const req = createRequest({}, { startDate: 'invalid' });
      const res = createResponse();

      await studySessionController.apiGetStudySessionSummary(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /startDate must be a valid datetime/);
    });

    it('should call service and return summary', async () => {
      const mockSummary = { total_sessions: 5 };
      studySessionServiceMock.getWeeklyStudySessionSummary = async () => mockSummary;

      const req = createRequest();
      const res = createResponse();

      await studySessionController.apiGetStudySessionSummary(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, mockSummary);
    });
  });

  describe('apiCreateStudySession', () => {
    it('should return 400 if no studentId', async () => {
      const req = createRequest({ userOverrides: { studentId: null } });
      const res = createResponse();

      await studySessionController.apiCreateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'No student record linked to this account.' });
    });

    it('should return 400 for unknown field', async () => {
      const req = createRequest({}, {}, { unknown: true });
      const res = createResponse();

      await studySessionController.apiCreateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Unknown field: unknown/);
    });

    it('should return 400 for validation error', async () => {
      const req = createRequest({}, {}, { title: '' });
      const res = createResponse();

      await studySessionController.apiCreateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /title cannot be empty/);
    });

    it('should return 201 on success', async () => {
      const createdSession = { id: 1, title: 'Test' };
      studySessionServiceMock.createStudySession = async () => createdSession;

      const req = createRequest({}, {}, {
        title: 'Test',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York'
      });
      const res = createResponse();

      await studySessionController.apiCreateStudySession(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.deepStrictEqual(res.body, createdSession);
    });
  });

  describe('apiUpdateStudySession', () => {
    it('should return 400 if no studentId', async () => {
      const req = createRequest({ userOverrides: { studentId: null } });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'No student record linked to this account.' });
    });

    it('should return 400 for invalid session ID', async () => {
      const req = createRequest({}, {}, {}, { id: 'invalid' });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'Invalid session ID' });
    });

    it('should return 400 for unknown field', async () => {
      const req = createRequest({}, {}, { unknown: true }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Unknown field: unknown/);
    });

    it('should return 404 if session not found', async () => {
      studySessionServiceMock.updateStudySessionForStudent = async () => ({ found: false, updated: false, session: null });

      const req = createRequest({}, {}, { title: 'Test' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(res.body, { error: 'Study session not found' });
    });

    it('should return 200 with no changes made', async () => {
      studySessionServiceMock.updateStudySessionForStudent = async () => ({ found: true, updated: false, session: {} });

      const req = createRequest({}, {}, { title: 'Test' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { message: 'No changes made', session: {} });
    });

    it('should return 200 with updated session', async () => {
      const updatedSession = { id: 1, title: 'Updated' };
      studySessionServiceMock.updateStudySessionForStudent = async () => ({ found: true, updated: true, session: updatedSession });

      const req = createRequest({}, {}, { title: 'Updated' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, updatedSession);
    });

    it('should return 400 for validation error', async () => {
      studySessionServiceMock.updateStudySessionForStudent = async () => {
        throw new Error('Invalid study session data: title is required');
      };

      const req = createRequest({}, {}, { title: '' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /title is required/);
    });
  });

  describe('apiUpdateStudySessionStatus', () => {
    it('should return 400 if no studentId', async () => {
      const req = createRequest({ userOverrides: { studentId: null } });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'No student record linked to this account.' });
    });

    it('should return 400 for invalid session ID', async () => {
      const req = createRequest({}, {}, { status: 'completed' }, { id: 'invalid' });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'Invalid session ID' });
    });

    it('should return 400 for unknown field', async () => {
      const req = createRequest({}, {}, { status: 'completed', unknown: true }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Unknown field: unknown/);
    });

    it('should return 400 if status is required', async () => {
      const req = createRequest({}, {}, {}, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'Status is required' });
    });

    it('should return 404 if session not found', async () => {
      studySessionServiceMock.transitionStudySessionStatus = async () => ({ found: false, valid: false, reason: 'not_found' });

      const req = createRequest({}, {}, { status: 'completed' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(res.body, { error: 'Study session not found' });
    });

    it('should return 400 for invalid status', async () => {
      studySessionServiceMock.transitionStudySessionStatus = async () => ({ found: true, valid: false, reason: 'invalid_status' });

      const req = createRequest({}, {}, { status: 'invalid' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Status must be one of/);
    });

    it('should return 400 for actual_minutes required', async () => {
      studySessionServiceMock.transitionStudySessionStatus = async () => ({ found: true, valid: false, reason: 'actual_minutes_required' });

      const req = createRequest({}, {}, { status: 'completed' }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /actual_minutes is required/);
    });

    it('should return 400 for invalid actual_minutes', async () => {
      studySessionServiceMock.transitionStudySessionStatus = async () => ({ found: true, valid: false, reason: 'invalid_actual_minutes' });

      const req = createRequest({}, {}, { status: 'completed', actual_minutes: 0 }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /actual_minutes must be an integer between 1 and 720/);
    });

    it('should return 400 for before_start', async () => {
      studySessionServiceMock.transitionStudySessionStatus = async () => ({ found: true, valid: false, reason: 'before_start' });

      const req = createRequest({}, {}, { status: 'completed', actual_minutes: 60 }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Cannot complete a session before its scheduled start/);
    });

    it('should return 200 with updated session on success', async () => {
      const updatedSession = { id: 1, status: 'completed' };
      studySessionServiceMock.transitionStudySessionStatus = async () => ({ found: true, valid: true, session: updatedSession });

      const req = createRequest({}, {}, { status: 'completed', actual_minutes: 60 }, { id: 1 });
      const res = createResponse();

      await studySessionController.apiUpdateStudySessionStatus(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, updatedSession);
    });
  });

  describe('apiDeleteStudySession', () => {
    it('should return 400 if no studentId', async () => {
      const req = createRequest({ userOverrides: { studentId: null } });
      const res = createResponse();

      await studySessionController.apiDeleteStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'No student record linked to this account.' });
    });

    it('should return 400 for invalid session ID', async () => {
      const req = createRequest({}, {}, {}, { id: 'invalid' });
      const res = createResponse();

      await studySessionController.apiDeleteStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'Invalid session ID' });
    });

    it('should return 404 if session not found', async () => {
      studySessionServiceMock.deleteStudySessionForStudent = async () => ({ found: false, deleted: false });

      const req = createRequest({}, {}, {}, { id: 1 });
      const res = createResponse();

      await studySessionController.apiDeleteStudySession(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(res.body, { error: 'Study session not found' });
    });

    it('should return 400 if delete failed', async () => {
      studySessionServiceMock.deleteStudySessionForStudent = async () => ({ found: true, deleted: false });

      const req = createRequest({}, {}, {}, { id: 1 });
      const res = createResponse();

      await studySessionController.apiDeleteStudySession(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'Failed to delete study session' });
    });

    it('should return 200 with success message', async () => {
      studySessionServiceMock.deleteStudySessionForStudent = async () => ({ found: true, deleted: true });

      const req = createRequest({}, {}, {}, { id: 1 });
      const res = createResponse();

      await studySessionController.apiDeleteStudySession(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { message: 'Study session deleted successfully' });
    });

    it('should return 500 on unexpected error', async () => {
      studySessionServiceMock.deleteStudySessionForStudent = async () => {
        throw new Error('Database error');
      };

      const req = createRequest({}, {}, {}, { id: 1 });
      const res = createResponse();

      await studySessionController.apiDeleteStudySession(req, res);

      assert.strictEqual(res.statusCode, 500);
      assert.deepStrictEqual(res.body, { error: 'Failed to delete study session' });
    });
  });
});