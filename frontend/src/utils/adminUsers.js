export const ADMIN_USERS_PAGE_SIZE = 20;

export function positiveAdminUserId(value) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) return null;
    value = normalized;
  } else if (typeof value !== 'number') {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function displayAdminUserText(value) {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

export function formatAdminUserDate(value, language = 'en') {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  if (typeof value === 'string' && value.trim() === '') return '—';

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

function normalizeUser(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonNegativeSafeInteger(value) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) return null;
    value = normalized;
  } else if (typeof value !== 'number') {
    return null;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function normalizeAdminUsersResponse(data, requestedPage = 1, pageSize = ADMIN_USERS_PAGE_SIZE) {
  const response = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const users = Array.isArray(response.users) ? response.users.filter(normalizeUser) : [];
  const total = nonNegativeSafeInteger(response.total) ?? users.length;
  const safePageSize = positiveAdminUserId(pageSize) || ADMIN_USERS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const requested = positiveAdminUserId(requestedPage) || 1;

  return {
    users,
    total,
    totalPages,
    page: Math.min(requested, totalPages),
  };
}
