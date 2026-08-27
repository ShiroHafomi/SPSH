'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const studySessionService = require('./studySessionService');

// Mock the pool
const poolMock = {
  queryImplementation: async (...args) => {
    // Default implementation, can be overridden in tests
    return [[]];
  },
  query: async (...args) => {
    return poolMock.queryImplementation(...args);
  }
};

// We'll replace the pool in the service with our mock
let originalPool;
beforeEach(() => {
  originalPool = studySessionService.pool;
  studySessionService.pool = poolMock;
  // Reset mock implementation to default
  poolMock.queryImplementation = async (...args) => {
    return [[]];
  };
});

afterEach(() => {
  studySessionService.pool = originalPool;
});

describe('StudySessionService', () => {
  describe('validateStudySessionData', () => {
    it('should return empty array for valid data', () => {
      const data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
      };
      const errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, []);
    });

    it('should validate title', () => {
      let data = {
        title: '',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
      };
      let errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['title cannot be empty or only whitespace']);

      data.title = 'A'.repeat(121);
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['title must be 120 characters or less']);
    });

    it('should validate subject length', () => {
      const data = {
        title: 'Study Session',
        subject: 'A'.repeat(81),
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
      };
      const errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['subject must be 80 characters or less']);
    });

    it('should validate timezone', () => {
      const data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'Invalid/Timezone',
        status: 'planned',
      };
      const errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['timezone must be a valid IANA timezone identifier']);
    });

    it('should validate starts_at and ends_at', () => {
      let data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
      };
      let errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['starts_at is required']);

      data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: 'invalid',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
      };
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['starts_at must be a valid datetime with an explicit UTC offset']);

      data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T11:00:00Z',
        ends_at: '2023-01-01T10:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
      };
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['ends_at must be after starts_at']);
    });

    it('should validate planned duration', () => {
      const data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T10:04:00Z', // 4 minutes
        timezone: 'America/New_York',
        status: 'planned',
      };
      const errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['planned duration must be between 5 and 480 minutes']);

      data.ends_at = '2023-01-02T10:00:00Z'; // 24 hours
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['planned duration must be between 5 and 480 minutes']);
    });

    it('should validate status', () => {
      const data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'invalid',
      };
      const errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['status must be one of: planned, completed, skipped']);
    });

    it('should validate actual_minutes for completed sessions', () => {
      let data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'completed',
        actual_minutes: null,
      };
      let errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['actual_minutes is required for completed sessions']);

      data.actual_minutes = 0;
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['actual_minutes must be an integer between 1 and 720']);

      data.actual_minutes = 721;
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['actual_minutes must be an integer between 1 and 720']);

      data.actual_minutes = 60;
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, []);
    });

    it('should reject actual_minutes for non-completed sessions', () => {
      const data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
        actual_minutes: 60,
      };
      const errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['actual_minutes must be empty for non-completed sessions']);
    });

    it('should validate completed_at', () => {
      let data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'completed',
        completed_at: 'invalid',
        actual_minutes: 60,
      };
      let errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['completed_at must be a valid datetime']);

      data = {
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00Z',
        ends_at: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
        completed_at: '2023-01-01T10:00:00Z',
      };
      errors = studySessionService.validateStudySessionData(data);
      assert.deepStrictEqual(errors, ['completed_at must be empty for non-completed sessions']);
    });
  });

  describe('parseUtcInstant', () => {
    it('should parse ISO string with Z', () => {
      const date = studySessionService.parseUtcInstant('2023-01-01T10:00:00Z');
      assert.ok(date instanceof Date);
      assert.strictEqual(date.getTime(), Date.UTC(2023, 0, 1, 10, 0, 0));
    });

    it('should parse ISO string with offset', () => {
      const date = studySessionService.parseUtcInstant('2023-01-01T10:00:00+05:00');
      assert.ok(date instanceof Date);
      // 10:00 +05:00 is 05:00 UTC
      assert.strictEqual(date.getTime(), Date.UTC(2023, 0, 1, 5, 0, 0));
    });

    it('should parse MySQL datetime string', () => {
      const date = studySessionService.parseUtcInstant('2023-01-01 10:00:00');
      assert.ok(date instanceof Date);
      assert.strictEqual(date.getTime(), Date.UTC(2023, 0, 1, 10, 0, 0));
    });

    it('should return null for invalid input', () => {
      assert.strictEqual(studySessionService.parseUtcInstant(null), null);
      assert.strictEqual(studySessionService.parseUtcInstant(undefined), null);
      assert.strictEqual(studySessionService.parseUtcInstant(''), null);
      assert.strictEqual(studySessionService.parseUtcInstant('invalid'), null);
      // No explicit zone
      assert.strictEqual(studySessionService.parseUtcInstant('2023-01-01T10:00:00'), null);
    });
  });

  describe('toMysqlUtc and toIsoUtc', () => {
    it('should convert Date to MySQL UTC string', () => {
      const date = new Date(Date.UTC(2023, 0, 1, 10, 0, 0));
      const mysql = studySessionService.toMysqlUtc(date);
      assert.strictEqual(mysql, '2023-01-01 10:00:00');
    });

    it('should convert Date to ISO UTC string', () => {
      const date = new Date(Date.UTC(2023, 0, 1, 10, 0, 0));
      const iso = studySessionService.toIsoUtc(date);
      assert.strictEqual(iso, '2023-01-01T10:00:00.000Z');
    });
  });

  describe('createStudySession', () => {
    it('should create a study session with valid data', async () => {
      const insertId = 1;
      poolMock.query.mockImplementationOnce(async () => [{ insertId }]);
      poolMock.query.mockImplementationOnce(async () => [[{
        id: insertId,
        student_id: 1,
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01 10:00:00',
        ends_at: '2023-01-01 11:00:00',
        timezone: 'America/New_York',
        status: 'planned',
        actual_minutes: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }]]);

      const session = await studySessionService.createStudySession({
        studentId: 1,
        title: 'Study Session',
        subject: 'Math',
        startsAt: '2023-01-01T10:00:00Z',
        endsAt: '2023-01-01T11:00:00Z',
        timezone: 'America/New_York',
        status: 'planned',
        actualMinutes: null,
        completedAt: null,
      });

      assert.strictEqual(session.id, insertId);
      assert.strictEqual(session.title, 'Study Session');
      assert.strictEqual(session.subject, 'Math');
      // Check that datetimes are converted to ISO string in the returned object
      assert.strictEqual(session.starts_at, '2023-01-01T10:00:00.000Z');
      assert.strictEqual(session.ends_at, '2023-01-01T11:00:00.000Z');
    });

    it('should throw error for invalid data', async () => {
      await assert.rejects(
        () => studySessionService.createStudySession({
          studentId: 1,
          title: '',
          subject: 'Math',
          startsAt: '2023-01-01T10:00:00Z',
          endsAt: '2023-01-01T11:00:00Z',
          timezone: 'America/New_York',
          status: 'planned',
          actualMinutes: null,
          completedAt: null,
        }),
        (err) => {
          assert.strictEqual(err.message, 'Invalid study session data: title cannot be empty or only whitespace');
          return true;
        }
      );
    });
  });

  describe('getStudySessionsByStudent', () => {
    it('should return sessions for a student with filters', async () => {
      const mockSessions = [
        {
          id: 1,
          student_id: 1,
          title: 'Study Session 1',
          subject: 'Math',
          starts_at: '2023-01-01 10:00:00',
          ends_at: '2023-01-01 11:00:00',
          timezone: 'America/New_York',
          status: 'planned',
          actual_minutes: null,
          completed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          student_id: 1,
          title: 'Study Session 2',
          subject: 'Science',
          starts_at: '2023-01-02 10:00:00',
          ends_at: '2023-01-02 11:00:00',
          timezone: 'America/New_York',
          status: 'completed',
          actual_minutes: 60,
          completed_at: '2023-01-02 11:00:00',
          created_at: new Date(),
          updated_at: new Date(),
        }
      ];
      poolMock.query.mockImplementationOnce(async () => [mockSessions]);
      poolMock.query.mockImplementationOnce(async () => [[{ total: 2 }]]);

      const sessions = await studySessionService.getStudySessionsByStudent(1, {
        startDate: '2023-01-01T00:00:00Z',
        endDate: '2023-01-03T00:00:00Z',
        status: undefined,
        subject: undefined,
        page: 1,
        size: 20
      });

      assert.strictEqual(sessions.length, 2);
      // Check that datetimes are converted to ISO string
      assert.strictEqual(sessions[0].starts_at, '2023-01-01T10:00:00.000Z');
      assert.strictEqual(sessions[1].status, 'completed');
      assert.strictEqual(sessions[1].actual_minutes, 60);
    });
  });

  describe('getWeeklyStudySessionSummary', () => {
    it('should return summary for a student in a date window', async () => {
      const mockRow = [{
        total_sessions: 2,
        planned_sessions: 1,
        completed_sessions: 1,
        skipped_sessions: 0,
        total_scheduled_minutes: 120,
        total_actual_minutes: 60
      }];
      poolMock.query.mockImplementationOnce(async () => [mockRow]);

      const summary = await studySessionService.getWeeklyStudySessionSummary(1, {
        startDate: '2023-01-01T00:00:00Z',
        endDate: '2023-01-08T00:00:00Z'
      });

      assert.strictEqual(summary.total_sessions, 2);
      assert.strictEqual(summary.planned_sessions, 1);
      assert.strictEqual(summary.completed_sessions, 1);
      assert.strictEqual(summary.skipped_sessions, 0);
      assert.strictEqual(summary.total_scheduled_minutes, 120);
      assert.strictEqual(summary.total_actual_minutes, 60);
    });
  });

  describe('transitionStudySessionStatus', () => {
    it('should transition from planned to completed when actual_minutes provided and after start time', async () => {
      const now = new Date('2023-01-01T12:00:00Z'); // after start time
      const currentSession = {
        id: 1,
        student_id: 1,
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00',
        ends_at: '2023-01-01T11:00:00',
        timezone: 'America/New_York',
        status: 'planned',
        actual_minutes: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      poolMock.query.mockImplementationOnce(async () => [[currentSession]]);
      poolMock.query.mockImplementationOnce(async () => [{ affectedRows: 1 }]);
      poolMock.query.mockImplementationOnce(async () => [[{
        ...currentSession,
        status: 'completed',
        actual_minutes: 60,
        completed_at: studySessionService.toMysqlUtc(now)
      }]]);

      const result = await studySessionService.transitionStudySessionStatus(
        1, // studentId
        1, // sessionId
        'completed', // status
        { actualMinutes: 60, now }
      );

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, null);
      assert.strictEqual(result.session.status, 'completed');
      assert.strictEqual(result.session.actual_minutes, 60);
      assert.ok(result.session.completed_at);
    });

    it('should reject transition to completed without actual_minutes', async () => {
      const result = await studySessionService.transitionStudySessionStatus(
        1,
        1,
        'completed',
        { actualMinutes: null }
      );

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'actual_minutes_required');
    });

    it('should reject transition to completed if before start time', async () => {
      const now = new Date('2023-01-01T09:00:00Z'); // before start time
      const currentSession = {
        id: 1,
        student_id: 1,
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00',
        ends_at: '2023-01-01T11:00:00',
        timezone: 'America/New_York',
        status: 'planned',
        actual_minutes: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      poolMock.query.mockImplementationOnce(async () => [[currentSession]]);

      const result = await studySessionService.transitionStudySessionStatus(
        1,
        1,
        'completed',
        { actualMinutes: 60, now }
      );

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'before_start');
    });

    it('should transition from completed to planned (reopen)', async () => {
      const now = new Date();
      const currentSession = {
        id: 1,
        student_id: 1,
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00',
        ends_at: '2023-01-01T11:00:00',
        timezone: 'America/New_York',
        status: 'completed',
        actual_minutes: 60,
        completed_at: '2023-01-01T11:00:00',
        created_at: new Date(),
        updated_at: new Date(),
      };
      poolMock.query.mockImplementationOnce(async () => [[currentSession]]);
      poolMock.query.mockImplementationOnce(async () => [{ affectedRows: 1 }]);
      poolMock.query.mockImplementationOnce(async () => [[{
        ...currentSession,
        status: 'planned',
        actual_minutes: null,
        completed_at: null
      }]]);

      const result = await studySessionService.transitionStudySessionStatus(
        1,
        1,
        'planned',
        {}
      );

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, null);
      assert.strictEqual(result.session.status, 'planned');
      assert.strictEqual(result.session.actual_minutes, null);
      assert.strictEqual(result.session.completed_at, null);
    });
  });

  describe('deleteStudySessionForStudent', () => {
    it('should delete a session if it belongs to the student', async () => {
      const session = {
        id: 1,
        student_id: 1,
        title: 'Study Session',
        subject: 'Math',
        starts_at: '2023-01-01T10:00:00',
        ends_at: '2023-01-01T11:00:00',
        timezone: 'America/New_York',
        status: 'planned',
        actual_minutes: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      poolMock.query.mockImplementationOnce(async () => [[session]]);
      poolMock.query.mockImplementationOnce(async () => [{ affectedRows: 1 }]);

      const result = await studySessionService.deleteStudySessionForStudent(1, 1);

      assert.strictEqual(result.found, true);
      assert.strictEqual(result.deleted, true);
    });

    it('should return not found if session does not belong to student', async () => {
      poolMock.query.mockImplementationOnce(async () => [[]]); // no session found

      const result = await studySessionService.deleteStudySessionForStudent(1, 1);

      assert.strictEqual(result.found, false);
      assert.strictEqual(result.deleted, false);
    });
  });
});