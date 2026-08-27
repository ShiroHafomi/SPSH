export const EMPTY_VALUE = '—';
export const PREDICTION_KINDS = Object.freeze(['prediction', 'feedback', 'baseline', 'simulation']);
export const GRADES = Object.freeze(['A', 'B', 'C', 'D', 'F']);
export const DRIFT_FEATURES = Object.freeze([
  'study_hours',
  'attendance_percent',
  'sleep_hours',
  'previous_gpa',
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_CALENDAR_DAYS = 30;
const MAX_WINDOW_DAYS = 366;

const KIND_PRESENTATION = Object.freeze({
  prediction: { labelKey: 'mlMonitoring.kinds.prediction', variant: 'success', production: true },
  feedback: { labelKey: 'mlMonitoring.kinds.feedback', variant: 'info', production: false },
  baseline: { labelKey: 'mlMonitoring.kinds.baseline', variant: 'gray', production: false },
  simulation: { labelKey: 'mlMonitoring.kinds.simulation', variant: 'warning', production: false },
});

const DRIFT_PRESENTATION = Object.freeze({
  stable: { labelKey: 'mlMonitoring.status.stable', variant: 'success', icon: 'check' },
  warning: { labelKey: 'mlMonitoring.status.warning', variant: 'warning', icon: 'warning' },
  drifted: { labelKey: 'mlMonitoring.status.drifted', variant: 'danger', icon: 'danger' },
  insufficient_data: { labelKey: 'mlMonitoring.status.insufficientData', variant: 'gray', icon: 'unknown' },
});

export function finiteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatNumber(value, digits = 1, locale) {
  const number = finiteNumber(value);
  if (number === null) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

export function formatPercentage(value, locale) {
  const number = finiteNumber(value);
  if (number === null || number < 0 || number > 1) return EMPTY_VALUE;
  return `${formatNumber(number * 100, 1, locale)}%`;
}

export function formatLatency(value, locale) {
  const number = finiteNumber(value);
  if (number === null || number < 0) return EMPTY_VALUE;
  return `${formatNumber(number, 0, locale)} ms`;
}

export function formatPositiveInteger(value, locale) {
  const number = finiteNumber(value);
  return Number.isSafeInteger(number) && number > 0
    ? formatNumber(number, 0, locale)
    : EMPTY_VALUE;
}

export function shortenModelVersion(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value)
    ? `${value.slice(0, 10)}…${value.slice(-6)}`
    : EMPTY_VALUE;
}

export function formatDateTime(value, locale) {
  if (typeof value !== 'string' || !isValidCalendarDate(value.slice(0, 10))) return EMPTY_VALUE;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value, locale) {
  if (typeof value !== 'string' || !isValidCalendarDate(value.slice(0, 10))) return EMPTY_VALUE;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatChartDateLabels(chart, locale) {
  if (!chart || !Array.isArray(chart.labels)) return chart || null;
  return {
    ...chart,
    labels: chart.labels.map((label) => (
      isValidCalendarDate(label)
        ? formatDate(`${label}T00:00:00.000Z`, locale)
        : EMPTY_VALUE
    )),
  };
}

export function isValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function validateDateRange(from, to) {
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to)) return 'invalid';
  if (from > to) return 'reversed';
  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const toTime = Date.parse(`${to}T00:00:00.000Z`);
  return toTime - fromTime > MAX_WINDOW_DAYS * DAY_MS ? 'tooLong' : null;
}

function positiveInteger(value, fallback, maximum) {
  const number = finiteNumber(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum
    ? number
    : fallback;
}

export function createDefaultFilters(now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - (DEFAULT_WINDOW_CALENDAR_DAYS - 1) * DAY_MS);
  const isoDate = (date) => Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : '';
  return {
    from: isoDate(start),
    to: isoDate(end),
    kind: '',
    grade: '',
    size: 20,
    page: 1,
  };
}

export function serializeHistoryFilters(filters = {}) {
  const params = new URLSearchParams();
  params.set('page', String(positiveInteger(filters.page, 1, 100000)));
  params.set('size', String(positiveInteger(filters.size, 20, 100)));
  if (isValidCalendarDate(filters.from)) params.set('from', filters.from);
  if (isValidCalendarDate(filters.to)) params.set('to', filters.to);
  if (PREDICTION_KINDS.includes(filters.kind)) params.set('kind', filters.kind);
  if (typeof filters.modelVersion === 'string' && SHA256_PATTERN.test(filters.modelVersion)) {
    params.set('modelVersion', filters.modelVersion);
  }
  if (GRADES.includes(filters.grade)) params.set('grade', filters.grade);
  return params.toString();
}

export function serializeDriftFilters(filters = {}) {
  const params = new URLSearchParams();
  if (isValidCalendarDate(filters.from)) params.set('from', filters.from);
  if (isValidCalendarDate(filters.to)) params.set('to', filters.to);
  if (typeof filters.modelVersion === 'string' && SHA256_PATTERN.test(filters.modelVersion)) {
    params.set('modelVersion', filters.modelVersion);
  }
  return params.toString();
}

export function normalizePagination(value = {}, requested = {}) {
  const size = positiveInteger(value.size, positiveInteger(requested.size, 20, 100), 100);
  const parsedTotal = finiteNumber(value.total);
  const total = Number.isSafeInteger(parsedTotal) && parsedTotal >= 0 ? parsedTotal : 0;
  const calculatedPages = total === 0 ? 0 : Math.ceil(total / size);
  const parsedPages = finiteNumber(value.totalPages);
  const reportedPages = Number.isSafeInteger(parsedPages) && parsedPages >= 0
    ? parsedPages
    : calculatedPages;
  const totalPages = reportedPages === calculatedPages ? reportedPages : calculatedPages;
  const requestedPage = positiveInteger(value.page, positiveInteger(requested.page, 1, 100000), 100000);
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  return { page, size, total, totalPages };
}

export function getPredictionKindPresentation(kind) {
  return KIND_PRESENTATION[kind] || {
    labelKey: 'mlMonitoring.kinds.unknown',
    variant: 'gray',
    production: false,
  };
}

export function getDriftStatusPresentation(status) {
  return DRIFT_PRESENTATION[status] || DRIFT_PRESENTATION.insufficient_data;
}

export function isProductionKind(kind) {
  return getPredictionKindPresentation(kind).production;
}

export function sortHistoryChronologically(rows = []) {
  const validRows = Array.isArray(rows) ? rows : [];
  return [...validRows].sort((left, right) => {
    const leftTime = new Date(left?.createdAt).getTime();
    const rightTime = new Date(right?.createdAt).getTime();
    if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
    if (!Number.isFinite(rightTime)) return -1;
    return leftTime - rightTime;
  });
}

export function derivePageSummary(rows = []) {
  const validRows = Array.isArray(rows) ? rows : [];
  const average = (field, isValid) => {
    const values = validRows
      .map((row) => finiteNumber(row?.[field]))
      .filter((value) => value !== null && isValid(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const gradeCounts = new Map();
  validRows.forEach((row) => {
    if (GRADES.includes(row?.predictedGrade)) {
      gradeCounts.set(row.predictedGrade, (gradeCounts.get(row.predictedGrade) || 0) + 1);
    }
  });
  const mostCommonGrade = GRADES.reduce((best, grade) => {
    if (!best || (gradeCounts.get(grade) || 0) > (gradeCounts.get(best) || 0)) return grade;
    return best;
  }, null);
  return {
    averageInferenceLatency: average('inferenceLatencyMs', (value) => value >= 0),
    averageGradeConfidence: average('gradeConfidence', (value) => value >= 0 && value <= 1),
    mostCommonGrade: gradeCounts.size ? mostCommonGrade : null,
  };
}

export function currentSampleRange(features = []) {
  const counts = features
    .map((feature) => finiteNumber(feature?.currentSampleCount))
    .filter((count) => Number.isSafeInteger(count) && count >= 0);
  if (!counts.length) return null;
  return { minimum: Math.min(...counts), maximum: Math.max(...counts) };
}

function chartRows(rows) {
  const validRows = Array.isArray(rows) ? rows : [];
  return sortHistoryChronologically(validRows).filter((row) => {
    if (typeof row?.createdAt !== 'string' || !isValidCalendarDate(row.createdAt.slice(0, 10))) {
      return false;
    }
    const time = new Date(row.createdAt).getTime();
    return Number.isFinite(time) && PREDICTION_KINDS.includes(row.predictionKind);
  });
}

function kindDatasets(kinds, labelsByKind, colorByKind, createData) {
  return kinds.map((kind) => ({
    label: labelsByKind[kind],
    borderColor: colorByKind[kind].border,
    backgroundColor: colorByKind[kind].bg,
    pointBackgroundColor: colorByKind[kind].border,
    data: createData(kind),
    tension: 0.3,
    spanGaps: false,
  }));
}

export function buildCurrentPageCharts(rows = [], labelsByKind = {}, colorByKind = {}) {
  const source = chartRows(rows);
  const kinds = PREDICTION_KINDS.filter((kind) => source.some((row) => row.predictionKind === kind));
  if (!kinds.length) return { volume: null, confidence: null, latency: null, grades: null };

  const days = [...new Set(source.map((row) => row.createdAt.slice(0, 10)))].sort();
  const byDayKind = new Map();
  source.forEach((row) => {
    const key = `${row.createdAt.slice(0, 10)}:${row.predictionKind}`;
    const bucket = byDayKind.get(key) || [];
    bucket.push(row);
    byDayKind.set(key, bucket);
  });

  const volume = {
    labels: days,
    datasets: kindDatasets(kinds, labelsByKind, colorByKind, (kind) => (
      days.map((day) => (byDayKind.get(`${day}:${kind}`) || []).length)
    )),
  };

  const averageDatasets = (field, isValid, transform = (value) => value) => kindDatasets(
    kinds,
    labelsByKind,
    colorByKind,
    (kind) => days.map((day) => {
      const values = (byDayKind.get(`${day}:${kind}`) || [])
        .map((row) => finiteNumber(row[field]))
        .filter((value) => value !== null && isValid(value));
      if (!values.length) return null;
      return transform(values.reduce((sum, value) => sum + value, 0) / values.length);
    })
  ).filter((dataset) => dataset.data.filter(Number.isFinite).length >= 2);

  const confidenceDatasets = averageDatasets(
    'gradeConfidence',
    (value) => value >= 0 && value <= 1,
    (value) => value * 100
  );
  const latencyDatasets = averageDatasets('inferenceLatencyMs', (value) => value >= 0);
  const gradeDatasets = kindDatasets(kinds, labelsByKind, colorByKind, (kind) => (
    GRADES.map((grade) => source.filter((row) => (
      row.predictionKind === kind && row.predictedGrade === grade
    )).length)
  ));

  return {
    volume: source.length ? volume : null,
    confidence: confidenceDatasets.length ? { labels: days, datasets: confidenceDatasets } : null,
    latency: latencyDatasets.length ? { labels: days, datasets: latencyDatasets } : null,
    grades: source.some((row) => GRADES.includes(row.predictedGrade))
      ? { labels: GRADES, datasets: gradeDatasets }
      : null,
  };
}
