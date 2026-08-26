'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../config/db');
const modelSnapshotService = require('./modelSnapshotService');
const service = require('./predictionHistoryService');

const originalQuery = pool.query;
const originalGetActiveSnapshot = modelSnapshotService.getActiveSnapshot;

const validInput = Object.freeze({
  gender: 'Female',
  age: 20,
  study_hours_per_day: 4.5,
  attendance_percent: 88,
  sleep_hours: 7.5,
  previous_gpa: 3.4,
  parental_education: 'Master',
  internet_access: 1,
  extracurricular: 1,
  part_time_job: 0,
});
const validResult = Object.freeze({
  final_score: 86.25,
  grade: 'B',
  grade_confidence: 0.84,
  grade_probabilities: { A: 0.1, B: 0.84, C: 0.06 },
});
const validEvent = Object.freeze({
  actorUserId: 7,
  studentId: 11,
  modelSnapshotId: 13,
  predictionKind: 'prediction',
  predictedScore: 86.25,
  predictedGrade: 'B',
  gradeConfidence: 0.84,
  inferenceLatencyMs: 25,
  studyHours: 4.5,
  attendancePercent: 88,
  sleepHours: 7.5,
  previousGpa: 3.4,
  inputFingerprint: 'a'.repeat(64),
});

describe('predictionHistoryService', () => {
  beforeEach(() => {
    pool.query = originalQuery;
    modelSnapshotService.getActiveSnapshot = async () => ({
      snapshotId: 13,
      modelVersion: 'b'.repeat(64),
    });
  });

  afterEach(() => {
    pool.query = originalQuery;
    modelSnapshotService.getActiveSnapshot = originalGetActiveSnapshot;
  });

  describe('generateInputFingerprint', () => {
    it('is stable across key order and normalized string whitespace', () => {
      const first = service.generateInputFingerprint(validInput);
      const second = service.generateInputFingerprint({
        part_time_job: 0,
        previous_gpa: 3.4,
        sleep_hours: 7.5,
        attendance_percent: 88,
        study_hours_per_day: 4.5,
        age: 20,
        gender: 'Female ',
        parental_education: 'Master',
        internet_access: true,
        extracurricular: true,
      });

      assert.equal(first, second);
      assert.match(first, /^[a-f0-9]{64}$/);
    });

    it('ignores sensitive and arbitrary fields', () => {
      const expected = service.generateInputFingerprint(validInput);
      const actual = service.generateInputFingerprint({
        ...validInput,
        password: 'do-not-store',
        token: 'secret-token',
        notes: 'private student notes',
        headers: { cookie: 'session=secret' },
      });

      assert.equal(actual, expected);
    });
  });

  describe('validatePredictionEvent', () => {
    it('accepts valid events and normalizes optional IDs and values', () => {
      assert.deepEqual(service.validatePredictionEvent(validEvent), validEvent);

      const nullable = service.validatePredictionEvent({
        ...validEvent,
        actorUserId: undefined,
        studentId: null,
        studyHours: undefined,
        attendancePercent: null,
        sleepHours: undefined,
        previousGpa: null,
      });
      assert.equal(nullable.actorUserId, null);
      assert.equal(nullable.studentId, null);
      assert.equal(nullable.studyHours, null);
      assert.equal(nullable.attendancePercent, null);
      assert.equal(nullable.sleepHours, null);
      assert.equal(nullable.previousGpa, null);
    });

    it('rejects invalid kinds, grades, numbers, IDs, fingerprints, and unknown fields', () => {
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, predictionKind: 'client-kind' }),
        /prediction_kind/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, predictedGrade: 'E' }),
        /predicted_grade/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, predictedScore: Number.NaN }),
        /predicted_score/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, gradeConfidence: Infinity }),
        /grade_confidence/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, inferenceLatencyMs: 1.5 }),
        /inference_latency_ms/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, inferenceLatencyMs: 60001 }),
        /inference_latency_ms/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, actorUserId: 0 }),
        /actor_user_id/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, inputFingerprint: 'invalid' }),
        /input_fingerprint/
      );
      assert.throws(
        () => service.validatePredictionEvent({ ...validEvent, rawPayload: validInput }),
        /Unknown prediction event field/
      );
    });
  });

  describe('insertPredictionEvent', () => {
    it('uses one parameterized insert with only approved values', async () => {
      let captured;
      pool.query = async (sql, params) => {
        captured = { sql, params };
        return [{ insertId: 41 }];
      };

      const eventId = await service.insertPredictionEvent(validEvent);

      assert.equal(eventId, 41);
      assert.match(captured.sql, /INSERT INTO ml_prediction_events/);
      assert.match(captured.sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/);
      assert.deepEqual(captured.params, [
        7, 11, 13, 'prediction', 86.25, 'B', 0.84, 25,
        4.5, 88, 7.5, 3.4, 'a'.repeat(64),
      ]);
      assert.equal(captured.params.includes(validInput.gender), false);
      assert.equal(captured.params.includes(validInput.parental_education), false);
    });

    it('turns database details into a safe persistence error', async () => {
      pool.query = async () => {
        throw new Error('mysql host and credentials');
      };

      await assert.rejects(
        service.insertPredictionEvent(validEvent),
        err => err.message === 'Failed to record prediction event'
      );
    });
  });

  describe('recordPredictionEvent', () => {
    it('atomically inserts the actual successful output with trusted context', async () => {
      let captured;
      let snapshotCalls = 0;
      modelSnapshotService.getActiveSnapshot = async () => {
        snapshotCalls += 1;
        return { snapshotId: 13, modelVersion: 'b'.repeat(64) };
      };
      pool.query = async (sql, params) => {
        captured = { sql, params };
        return [{ insertId: 42 }];
      };

      const recorded = await service.recordPredictionEvent(validInput, validResult, {
        predictionKind: 'feedback',
        actorUserId: 7,
        studentId: null,
        inferenceLatencyMs: 18,
      });

      assert.equal(recorded.eventId, 42);
      assert.equal(recorded.snapshotId, 13);
      assert.equal(snapshotCalls, 1);
      assert.deepEqual(captured.params.slice(0, 8), [
        7, null, 13, 'feedback', 86.25, 'B', 0.84, 18,
      ]);
      assert.equal(captured.params.length, 13);
    });

    it('rejects unknown input and context fields before persistence', async () => {
      let queryCalls = 0;
      let snapshotCalls = 0;
      pool.query = async () => { queryCalls += 1; };
      modelSnapshotService.getActiveSnapshot = async () => {
        snapshotCalls += 1;
        return { snapshotId: 13, modelVersion: 'b'.repeat(64) };
      };

      await assert.rejects(
        service.recordPredictionEvent(
          { ...validInput, actorUserId: 999 },
          validResult,
          {
            predictionKind: 'prediction',
            actorUserId: 7,
            studentId: null,
            inferenceLatencyMs: 10,
          }
        ),
        /Unknown field: actorUserId/
      );
      await assert.rejects(
        service.recordPredictionEvent(validInput, validResult, {
          predictionKind: 'prediction',
          actorUserId: 7,
          studentId: null,
          inferenceLatencyMs: 10,
          simulation: true,
        }),
        /Unknown prediction context field: simulation/
      );

      assert.equal(queryCalls, 0);
      assert.equal(snapshotCalls, 0);
    });

    it('rejects corrupt model output without clamping or inserting it', async () => {
      let queryCalls = 0;
      pool.query = async () => { queryCalls += 1; };

      await assert.rejects(
        service.recordPredictionEvent(
          validInput,
          { ...validResult, final_score: 101 },
          {
            predictionKind: 'prediction',
            actorUserId: 7,
            studentId: null,
            inferenceLatencyMs: 10,
          }
        ),
        /final_score/
      );
      await assert.rejects(
        service.recordPredictionEvent(
          validInput,
          { ...validResult, grade_confidence: Number.NaN },
          {
            predictionKind: 'prediction',
            actorUserId: 7,
            studentId: null,
            inferenceLatencyMs: 10,
          }
        ),
        /grade_confidence/
      );

      assert.equal(queryCalls, 0);
    });
  });
});
