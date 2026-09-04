const GRADE_ORDER = Object.freeze(['A', 'B', 'C', 'D', 'F']);

function localeFor(language) {
  return language === 'vi' ? 'vi-VN' : 'en-US';
}

export function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function clampNumber(value, minimum, maximum, fallback = minimum) {
  const number = toFiniteNumber(value);
  if (number === null) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

export function formatStudentMetric(value, language = 'en', options = {}) {
  const number = toFiniteNumber(value);
  if (number === null) return '—';

  try {
    return new Intl.NumberFormat(localeFor(language), options).format(number);
  } catch {
    return new Intl.NumberFormat('en-US', options).format(number);
  }
}

export function normalizeGrade(value) {
  const grade = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return GRADE_ORDER.includes(grade) ? grade : null;
}

export function normalizePercentage(value) {
  const number = toFiniteNumber(value);
  return number === null ? null : Math.min(100, Math.max(0, number));
}

export function normalizeProbabilityEntries(probabilities) {
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) return [];

  return GRADE_ORDER.flatMap((grade) => {
    const probability = toFiniteNumber(probabilities[grade]);
    return probability === null
      ? []
      : [{ grade, probability: clampNumber(probability, 0, 1, 0) }];
  });
}

function profileValue(value) {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : '';
}

function yesNoValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value === true || value === 1) return 'Yes';
  if (value === false || value === 0) return 'No';

  const normalized = String(value).trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) return 'Yes';
  if (['no', 'false', '0'].includes(normalized)) return 'No';
  return '';
}

export function buildStudentProfileForm(student = {}) {
  return {
    gender: profileValue(student.gender),
    age: profileValue(student.age),
    study_hours_per_day: profileValue(student.study_hours_per_day),
    attendance_percent: profileValue(student.attendance_percent),
    sleep_hours: profileValue(student.sleep_hours),
    previous_gpa: profileValue(student.previous_gpa),
    parental_education: profileValue(student.parental_education),
    internet_access: yesNoValue(student.internet_access),
    extracurricular: yesNoValue(student.extracurricular),
    part_time_job: yesNoValue(student.part_time_job),
    notes: profileValue(student.notes),
  };
}

export function buildSimulationInputs(student = {}) {
  return {
    study_hours_per_day: clampNumber(student.study_hours_per_day, 0, 24, 0),
    sleep_hours: clampNumber(student.sleep_hours, 0, 24, 0),
    attendance_percent: clampNumber(student.attendance_percent, 0, 100, 0),
  };
}

export function scoreTone(value) {
  const score = toFiniteNumber(value);
  if (score === null) return 'neutral';
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export function scoreDelta(simulated, current) {
  const simulatedScore = toFiniteNumber(simulated);
  const currentScore = toFiniteNumber(current);
  return simulatedScore === null || currentScore === null ? null : simulatedScore - currentScore;
}
