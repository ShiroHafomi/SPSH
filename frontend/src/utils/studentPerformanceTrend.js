const VALID_GRADES = new Set(['A', 'B', 'C', 'D', 'F']);
const SCORE_MIN = 0;
const SCORE_MAX = 100;
const STABLE_DELTA = 1;

function toFiniteScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(score) && score >= SCORE_MIN && score <= SCORE_MAX ? score : null;
}

function normalizeGrade(value) {
  const grade = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return VALID_GRADES.has(grade) ? grade : null;
}

function normalizeCreatedAt(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function getTrendStatus(change) {
  if (!Number.isFinite(change) || Math.abs(change) < STABLE_DELTA) return 'Stable';
  return change > 0 ? 'Improving' : 'Declining';
}

export function normalizePerformanceTrend(response) {
  const source = Array.isArray(response?.rows) ? response.rows : [];
  const rows = source
    .map((row, index) => ({
      id: Number.isSafeInteger(Number(row?.id)) ? Number(row.id) : index,
      createdAt: normalizeCreatedAt(row?.createdAt),
      predictedScore: toFiniteScore(row?.predictedScore),
      predictedGrade: normalizeGrade(row?.predictedGrade),
    }))
    .filter((row) => row.createdAt && (row.predictedScore !== null || row.predictedGrade !== null))
    .sort((left, right) => {
      const dateDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return dateDifference || left.id - right.id;
    });

  const scoreRows = rows.filter((row) => row.predictedScore !== null);
  const latestScore = scoreRows.at(-1)?.predictedScore ?? null;
  const previousScore = scoreRows.length > 1 ? scoreRows.at(-2).predictedScore : null;
  const change = latestScore !== null && previousScore !== null
    ? latestScore - previousScore
    : null;

  return {
    rows,
    scoreRows,
    gradeRows: rows.filter((row) => row.predictedGrade !== null),
    latestScore,
    previousScore,
    change,
    predictedScore: latestScore,
    trendStatus: getTrendStatus(change),
    hasData: rows.length > 0,
  };
}

export function formatTrendChange(change, formatNumber = (value) => String(value)) {
  if (!Number.isFinite(change)) return null;
  const sign = change > 0 ? '+' : '';
  return `${sign}${formatNumber(change)}`;
}
