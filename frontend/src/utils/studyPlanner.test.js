import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_STATUSES,
  startOfWeekMonday,
  shiftWeek,
  buildWeekWindow,
  buildQuery,
  parseSessionInstant,
  formatPlannedDuration,
  zonedDateTimeToUtc,
  getTimeZoneOffsetMs,
} from './studyPlanner.js';

describe('studyPlanner utils', () => {
  describe('SESSION_STATUSES', () => {
    it('contains planned, completed, and skipped', () => {
      assert.deepStrictEqual(SESSION_STATUSES, ['planned', 'completed', 'skipped']);
    });
  });

  describe('startOfWeekMonday', () => {
    it('returns the local Monday start of the week', () => {
      const monday = startOfWeekMonday(new Date(2023, 0, 2, 10));
      assert.deepStrictEqual(
        [monday.getFullYear(), monday.getMonth(), monday.getDate(), monday.getHours()],
        [2023, 0, 2, 0]
      );

      const previousMonday = startOfWeekMonday(new Date(2023, 0, 1, 10));
      assert.deepStrictEqual(
        [previousMonday.getFullYear(), previousMonday.getMonth(), previousMonday.getDate()],
        [2022, 11, 26]
      );
    });
  });

  describe('shiftWeek', () => {
    it('shifts by whole local calendar weeks', () => {
      const monday = new Date(2023, 0, 2, 10);
      const nextMonday = shiftWeek(monday, 1);
      const previousMonday = shiftWeek(monday, -1);

      assert.deepStrictEqual(
        [nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate(), nextMonday.getHours()],
        [2023, 0, 9, 0]
      );
      assert.deepStrictEqual(
        [previousMonday.getFullYear(), previousMonday.getMonth(), previousMonday.getDate(), previousMonday.getHours()],
        [2022, 11, 26, 0]
      );
    });
  });

  describe('buildWeekWindow', () => {
    it('returns a half-open local calendar week window', () => {
      const reference = new Date(2023, 0, 5, 10);
      const start = startOfWeekMonday(reference);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      assert.deepStrictEqual(buildWeekWindow(reference), {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
    });
  });

  describe('buildQuery', () => {
    it('serializes query parameters', () => {
      const params = { page: 1, size: 20, status: 'planned', subject: 'Math' };
      assert.strictEqual(buildQuery(params), '?page=1&size=20&status=planned&subject=Math');
    });

    it('omits undefined, null, and empty values', () => {
      const params = { page: 1, size: 20, status: '', subject: null, missing: undefined };
      assert.strictEqual(buildQuery(params), '?page=1&size=20');
    });

    it('returns an empty string when there are no parameters', () => {
      assert.strictEqual(buildQuery({}), '');
    });
  });

  describe('parseSessionInstant', () => {
    it('parses ISO strings with an explicit zone', () => {
      const date = parseSessionInstant('2023-01-01T10:00:00Z');
      assert.ok(date instanceof Date);
      assert.strictEqual(date.getTime(), Date.UTC(2023, 0, 1, 10, 0, 0));
    });

    it('parses MySQL datetime strings as UTC', () => {
      const date = parseSessionInstant('2023-01-01 10:00:00');
      assert.ok(date instanceof Date);
      assert.strictEqual(date.getTime(), Date.UTC(2023, 0, 1, 10, 0, 0));
    });

    it('rejects invalid and zone-less input', () => {
      assert.strictEqual(parseSessionInstant(null), null);
      assert.strictEqual(parseSessionInstant(undefined), null);
      assert.strictEqual(parseSessionInstant(''), null);
      assert.strictEqual(parseSessionInstant('invalid'), null);
      assert.strictEqual(parseSessionInstant('2023-01-01T10:00:00'), null);
    });
  });

  describe('formatPlannedDuration', () => {
    it('returns duration in minutes', () => {
      assert.strictEqual(
        formatPlannedDuration('2023-01-01T10:00:00Z', '2023-01-01T11:30:00Z'),
        90
      );
    });

    it('returns null for invalid input', () => {
      assert.strictEqual(formatPlannedDuration(null, '2023-01-01T11:00:00Z'), null);
      assert.strictEqual(formatPlannedDuration('2023-01-01T10:00:00Z', null), null);
      assert.strictEqual(formatPlannedDuration('invalid', '2023-01-01T11:00:00Z'), null);
    });
  });

  describe('zonedDateTimeToUtc', () => {
    it('converts wall-clock time to UTC', () => {
      const date = zonedDateTimeToUtc('2023-01-01', '10:00', 'America/New_York');
      assert.ok(date instanceof Date);
      assert.strictEqual(date.getTime(), Date.UTC(2023, 0, 1, 15, 0, 0));
    });

    it('honors daylight-saving time', () => {
      const date = zonedDateTimeToUtc('2023-07-01', '10:00', 'America/New_York');
      assert.ok(date instanceof Date);
      assert.strictEqual(date.getTime(), Date.UTC(2023, 6, 1, 14, 0, 0));
    });

    it('rejects malformed, impossible, and out-of-range input', () => {
      assert.strictEqual(zonedDateTimeToUtc(null, '10:00', 'America/New_York'), null);
      assert.strictEqual(zonedDateTimeToUtc('2023-01-01', null, 'America/New_York'), null);
      assert.strictEqual(zonedDateTimeToUtc('2023-01-01', '10:00', null), null);
      assert.strictEqual(zonedDateTimeToUtc('invalid', '10:00', 'America/New_York'), null);
      assert.strictEqual(zonedDateTimeToUtc('2023-01-01', 'invalid', 'America/New_York'), null);
      assert.strictEqual(zonedDateTimeToUtc('2023-02-30', '10:00', 'America/New_York'), null);
      assert.strictEqual(zonedDateTimeToUtc('2023-01-01', '24:00', 'America/New_York'), null);
    });
  });

  describe('getTimeZoneOffsetMs', () => {
    it('returns the applicable timezone offset in milliseconds', () => {
      const winterOffset = getTimeZoneOffsetMs(
        'America/New_York',
        new Date('2023-01-01T12:00:00Z')
      );
      const summerOffset = getTimeZoneOffsetMs(
        'America/New_York',
        new Date('2023-07-01T12:00:00Z')
      );

      assert.strictEqual(winterOffset, -5 * 60 * 60 * 1000);
      assert.strictEqual(summerOffset, -4 * 60 * 60 * 1000);
    });
  });
});
