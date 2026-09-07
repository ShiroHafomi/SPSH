export function isPositiveIntegerId(value) {
  const normalized = String(value ?? '').trim();
  return /^\d+$/.test(normalized) && Number(normalized) > 0;
}

export function formatAdminMetric(value, fractionDigits, suffix = '') {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(fractionDigits)}${suffix}` : '—';
}

export function getStudentFromDetailsResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const { student } = response;
  return student && typeof student === 'object' && !Array.isArray(student) ? student : null;
}
