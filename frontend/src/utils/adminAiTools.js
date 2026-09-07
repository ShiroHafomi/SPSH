export function isPositiveIntegerId(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return false;
  const id = Number(normalized);
  return Number.isSafeInteger(id) && id > 0;
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

export function getInterventionNote(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return '';
  const note = response.interventionNote ?? response.intervention_note;
  if (typeof note !== 'string') return '';
  const normalized = note.trim();
  return normalized.length > 0 && normalized.length <= 16000 ? normalized : '';
}

export function getInterventionErrorKey(error) {
  switch (error?.status) {
    case 401:
    case 403:
      return 'admin.interventionPermissionDenied';
    case 404:
      return 'admin.interventionStudentNotFound';
    case 422:
      return 'admin.interventionInsufficientData';
    case 429:
    case 503:
      return 'admin.interventionUnavailable';
    default:
      return 'admin.interventionUnexpectedError';
  }
}

export function createInterventionRequester(apiClient) {
  if (!apiClient || typeof apiClient.post !== 'function') {
    throw new TypeError('An API client with a post method is required.');
  }

  let inFlight = null;
  return {
    generate(studentId) {
      const normalizedId = String(studentId ?? '').trim();
      if (!isPositiveIntegerId(normalizedId)) {
        return Promise.reject(new RangeError('Student ID must be a positive safe integer.'));
      }
      if (inFlight) return inFlight;

      const request = Promise.resolve().then(() => (
        apiClient.post(`/admin/students/${normalizedId}/intervention`)
      ));
      inFlight = request.finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
