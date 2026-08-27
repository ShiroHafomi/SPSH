import { addDays, startOfWeek } from 'date-fns';

export const SESSION_STATUSES = ['planned', 'completed', 'skipped'];

/**
 * Start of the Monday-based week for an arbitrary date.
 * @param {Date|number|string} date
 * @returns {Date}
 */
export function startOfWeekMonday(date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/**
 * Shift the reference date by whole weeks (preserving the Monday anchor).
 * @param {Date} date
 * @param {number} weeks
 * @returns {Date}
 */
export function shiftWeek(date, weeks) {
  return addDays(startOfWeekMonday(date), weeks * 7);
}

/**
 * Compute the half-open date window for a week containing `referenceDate`.
 * The window uses the browser's local time and is returned as ISO strings
 * with an explicit offset so the backend receives unambiguous instants.
 *
 * @param {Date} referenceDate
 * @returns {{ startDate: string, endDate: string }}
 */
export function buildWeekWindow(referenceDate) {
  const start = startOfWeekMonday(referenceDate);
  const end = addDays(start, 7);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/**
 * Serialize an object of query parameters into a `?a=1&b=2` string, omitting
 * null/undefined/empty values so absent filters do not reach the API.
 *
 * @param {Record<string, string | number | boolean | null | undefined>} params
 * @returns {string}
 */
export function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Parse a session instant into a Date. Accepts ISO-8601 (with offset or `Z`)
 * and the MySQL `YYYY-MM-DD HH:MM:SS` form, which is interpreted as UTC.
 * Returns null for anything that would otherwise become `Invalid Date`.
 *
 * @param {*} value
 * @returns {Date|null}
 */
export function parseSessionInstant(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(s)) {
    s = `${s.replace(' ', 'T')}Z`;
  }

  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Planned duration in whole minutes between two session instants, or null if
 * either bound is missing/unparseable.
 *
 * @param {*} startValue
 * @param {*} endValue
 * @returns {number|null}
 */
export function formatPlannedDuration(startValue, endValue) {
  const start = parseSessionInstant(startValue);
  const end = parseSessionInstant(endValue);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * Offset of an IANA timezone from UTC, in milliseconds, at a given instant.
 * Uses Intl, so DST and historical rule changes are honored.
 */
function getTimeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const hour = Number(parts.hour) % 24;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

export { getTimeZoneOffsetMs };

/**
 * Convert a wall-clock date + time in a specific IANA timezone into a UTC Date.
 * Returns null when inputs are malformed or the timezone is invalid.
 *
 * @param {string} dateOnly "YYYY-MM-DD"
 * @param {string} timeOnly "HH:mm"
 * @param {string} timeZone IANA identifier
 * @returns {Date|null}
 */
export function zonedDateTimeToUtc(dateOnly, timeOnly, timeZone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || '').trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeOnly || '').trim());
  if (!dateMatch || !timeMatch || !timeZone) return null;

  try {
    const naiveUtc = Date.UTC(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      Number(timeMatch[1]),
      Number(timeMatch[2])
    );
    const offset = getTimeZoneOffsetMs(timeZone, new Date(naiveUtc));
    const result = new Date(naiveUtc - offset);
    return Number.isNaN(result.getTime()) ? null : result;
  } catch {
    return null;
  }
}

/**
 * Convert a wall-clock date + time in a specific IANA timezone into a UTC Date.
 * Returns null when inputs are malformed or the timezone is invalid.
 *
 * @param {string} dateOnly "YYYY-MM-DD"
 * @param {string} timeOnly "HH:mm"
 * @param {string} timeZone IANA identifier
 * @returns {Date|null}
 */
export function zonedDateTimeToUtc(dateOnly, timeOnly, timeZone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || '').trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeOnly || '').trim());
  if (!dateMatch || !timeMatch || !timeZone) return null;

  try {
    const naiveUtc = Date.UTC(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      Number(timeMatch[1]),
      Number(timeMatch[2])
    );
    const offset = getTimeZoneOffsetMs(timeZone, new Date(naiveUtc));
    const result = new Date(naiveUtc - offset);
    return Number.isNaN(result.getTime()) ? null : result;
  } catch {
    return null;
  }
}