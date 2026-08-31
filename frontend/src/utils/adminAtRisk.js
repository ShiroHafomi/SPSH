const SORTABLE_COLUMNS = new Set([
  'student_id',
  'name',
  'grade',
  'risk_level',
  'risk_factors',
  'attendance_percent',
  'sleep_hours',
  'previous_gpa',
  'study_hours_per_day',
  'part_time_job',
]);

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function isMissing(value) {
  return value == null || value === '';
}

function compareValues(left, right) {
  if (isMissing(left) && isMissing(right)) return 0;
  if (isMissing(left)) return 1;
  if (isMissing(right)) return -1;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  const leftText = Array.isArray(left) ? left.join(' ') : String(left);
  const rightText = Array.isArray(right) ? right.join(' ') : String(right);
  return leftText.localeCompare(rightText, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function filterAndSortAtRiskStudents(
  students,
  { search = '', grade = '', riskLevel = '' } = {},
  sort = 'risk_score',
  direction = 'desc'
) {
  const source = Array.isArray(students) ? students : [];
  const query = normalizeText(search);
  const normalizedGrade = normalizeText(grade);
  const normalizedRisk = normalizeText(riskLevel);
  const sortKey = SORTABLE_COLUMNS.has(sort) ? sort : 'risk_score';
  const sortDirection = direction === 'asc' ? 1 : -1;

  return source
    .filter((student) => {
      const matchesSearch = !query || [
        student?.student_id,
        student?.name,
        student?.notes,
      ].some((value) => normalizeText(value).includes(query));
      const matchesGrade = !normalizedGrade || normalizeText(student?.grade) === normalizedGrade;
      const matchesRisk = !normalizedRisk || normalizeText(student?.risk_level) === normalizedRisk;
      return matchesSearch && matchesGrade && matchesRisk;
    })
    .map((student, index) => ({ student, index }))
    .sort((left, right) => {
      const leftValue = left.student?.[sortKey];
      const rightValue = right.student?.[sortKey];
      if (isMissing(leftValue) && isMissing(rightValue)) return left.index - right.index;
      if (isMissing(leftValue)) return 1;
      if (isMissing(rightValue)) return -1;

      const comparison = compareValues(leftValue, rightValue);
      return comparison === 0 ? left.index - right.index : comparison * sortDirection;
    })
    .map(({ student }) => student);
}

export function paginateAtRiskStudents(students, page = 1, pageSize = 20) {
  const source = Array.isArray(students) ? students : [];
  const normalizedSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 20;
  const totalPages = Math.max(1, Math.ceil(source.length / normalizedSize));
  const normalizedPage = Math.min(
    totalPages,
    Number.isInteger(page) && page > 0 ? page : 1
  );
  const start = (normalizedPage - 1) * normalizedSize;

  return {
    students: source.slice(start, start + normalizedSize),
    page: normalizedPage,
    pageSize: normalizedSize,
    total: source.length,
    totalPages,
    start: source.length === 0 ? 0 : start + 1,
    end: Math.min(start + normalizedSize, source.length),
  };
}
