import {
  SESSION_STATUSES,
  startOfWeekMonday,
  shiftWeek,
  buildWeekWindow,
  buildQuery,
  parseSessionInstant,
  formatPlannedDuration,
  zonedDateTimeToUtc,
  getTimeZoneOffsetMs
} from './studyPlanner.js';

describe('studyPlanner utils', () => {
  describe('SESSION_STATUSES', () => {
    it('should contain planned, completed, skipped', () => {
      expect(SESSION_STATUSES).toEqual(['planned', 'completed', 'skipped']);
    });
  });

  describe('startOfWeekMonday', () => {
    it('should return Monday start of week', () => {
      // 2023-01-02 is a Monday
      const date = new Date('2023-01-02T10:00:00Z');
      const monday = startOfWeekMonday(date);
      expect(monday.toISOString()).toBe('2023-01-02T00:00:00.000Z');

      // 2023-01-01 is a Sunday
      const sunday = new Date('2023-01-01T10:00:00Z');
      const mondayOfPreviousWeek = startOfWeekMonday(sunday);
      expect(mondayOfPreviousWeek.toISOString()).toBe('2022-12-26T00:00:00.000Z');
    });
  });

  describe('shiftWeek', () => {
    it('should shift by whole weeks', () => {
      const monday = new Date('2023-01-02T00:00:00Z');
      const nextMonday = shiftWeek(monday, 1);
      expect(nextMonday.toISOString()).toBe('2023-01-09T00:00:00.000Z');

      const prevMonday = shiftWeek(monday, -1);
      expect(prevMonday.toISOString()).toBe('2022-12-26T00:00:00.000Z');
    });
  });

  describe('buildWeekWindow', () => {
    it('should return half-open week window', () => {
      // 2023-01-05 is a Thursday
      const date = new Date('2023-01-05T10:00:00Z');
      const window = buildWeekWindow(date);
      expect(window.startDate).toBe('2023-01-02T00:00:00.000Z'); // Monday
      expect(window.endDate).toBe('2023-01-09T00:00:00.000Z'); // Next Monday
    });
  });

  describe('buildQuery', () => {
    it('should serialize query parameters', () => {
      const params = { page: 1, size: 20, status: 'planned', subject: 'Math' };
      expect(buildQuery(params)).toBe('?page=1&size=20&status=planned&subject=Math');
    });

    it('should omit undefined/null/empty values', () => {
      const params = { page: 1, size: 20, status: '', subject: null, undefined: undefined };
      expect(buildQuery(params)).toBe('?page=1&size=20');
    });

    it('should return empty string for no params', () => {
      expect(buildQuery({})).toBe('');
    });
  });

  describe('parseSessionInstant', () => {
    it('should parse ISO string with Z', () => {
      const date = parseSessionInstant('2023-01-01T10:00:00Z');
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(Date.UTC(2023, 0, 1, 10, 0, 0));
    });

    it('should parse MySQL datetime string', () => {
      const date = parseSessionInstant('2023-01-01 10:00:00');
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(Date.UTC(2023, 0, 1, 10, 0, 0));
    });

    it('should return null for invalid input', () => {
      expect(parseSessionInstant(null)).toBeNull();
      expect(parseSessionInstant(undefined)).toBeNull();
      expect(parseSessionInstant('')).toBeNull();
      expect(parseSessionInstant('invalid')).toBeNull();
      // No explicit zone
      expect(parseSessionInstant('2023-01-01T10:00:00')).toBeNull();
    });
  });

  describe('formatPlannedDuration', () => {
    it('should return duration in minutes', () => {
      const start = '2023-01-01T10:00:00Z';
      const end = '2023-01-01T11:30:00Z';
      expect(formatPlannedDuration(start, end)).toBe(90);
    });

    it('should return null for invalid input', () => {
      expect(formatPlannedDuration(null, '2023-01-01T11:00:00Z')).toBeNull();
      expect(formatPlannedDuration('2023-01-01T10:00:00Z', null)).toBeNull();
      expect(formatPlannedDuration('invalid', '2023-01-01T11:00:00Z')).toBeNull();
    });
  });

  describe('zonedDateTimeToUtc', () => {
    it('should convert wall-clock to UTC', () => {
      // New York is UTC-5 in January
      const date = zonedDateTimeToUtc('2023-01-01', '10:00', 'America/New_York');
      expect(date).toBeInstanceOf(Date);
      // 10:00 EST is 15:00 UTC
      expect(date.getTime()).toBe(Date.UTC(2023, 0, 1, 15, 0, 0));
    });

    it('should handle DST', () => {
      // New York is UTC-4 in July
      const date = zonedDateTimeToUtc('2023-07-01', '10:00', 'America/New_York');
      expect(date).toBeInstanceOf(Date);
      // 10:00 EDT is 14:00 UTC
      expect(date.getTime()).toBe(Date.UTC(2023, 6, 1, 14, 0, 0));
    });

    it('should return null for invalid input', () => {
      expect(zonedDateTimeToUtc(null, '10:00', 'America/New_York')).toBeNull();
      expect(zonedDateTimeToUtc('2023-01-01', null, 'America/New_York')).toBeNull();
      expect(zonedDateTimeToUtc('2023-01-01', '10:00', null)).toBeNull();
      expect(zonedDateTimeToUtc('invalid', '10:00', 'America/New_York')).toBeNull();
      expect(zonedDateTimeToUtc('2023-01-01', 'invalid', 'America/New_York')).toBeNull();
    });
  });

  describe('getTimeZoneOffsetMs', () => {
    it('should return offset in milliseconds', () => {
      const date = new Date('2023-01-01T00:00:00Z'); // Winter in NY
      const offset = getTimeZoneOffsetMs('America/New_York', date);
      // EST is UTC-5
      expect(offset).toBe(-5 * 60 * 60 * 1000);

      const summerDate = new Date('2023-07-01T00:00:00Z'); // Summer in NY
      const offsetSummer = getTimeZoneOffsetMs('America/New_York', summerDate);
      // EDT is UTC-4
      expect(offsetSummer).toBe(-4 * 60 * 60 * 1000);
    });
  });
});