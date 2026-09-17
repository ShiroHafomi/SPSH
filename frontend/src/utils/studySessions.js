export const TIMER_BASE = '/student/me/study-timers';
export const MAX_SECONDS = 28800;
export const TIMER_STATUSES = ['running', 'paused', 'completed', 'discarded'];
const positive = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
export function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19) ? date : null;
}
export function defaultWindow(now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  return { from: new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10), to, status: 'all' };
}
export function validWindow({ from, to }) {
  const dates = [from, to].map(value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = instant(`${value}T00:00:00Z`);
    return date && date.toISOString().slice(0, 10) === value && date.getUTCFullYear() >= 1000 && date.getUTCFullYear() <= 9998 ? date : null;
  });
  return Boolean(dates[0] && dates[1] && dates[1] >= dates[0] && (dates[1] - dates[0]) / 86400000 < 93);
}
export function startPayload(title, assignmentId = '') {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 150 || /[\x00-\x1f\x7f]/.test(title.trim())) return null;
  const assignment_id = assignmentId === '' || assignmentId === null ? null : Number(assignmentId);
  if (assignment_id !== null && (!/^[1-9]\d*$/.test(String(assignmentId)) || !positive(assignment_id))) return null;
  return { title: title.trim(), assignment_id };
}
export function normalizeSession(session) {
  if (session === null) return null;
  if (!session || !positive(session.id) || !positive(session.version) || !TIMER_STATUSES.includes(session.status)
    || typeof session.title !== 'string' || !session.title.trim() || session.title.length > 150
    || !finite(session.elapsedSeconds) || session.elapsedSeconds > MAX_SECONDS || !finite(session.accumulated_seconds) || session.accumulated_seconds > MAX_SECONDS
    || !instant(session.started_at) || (session.status === 'running' && !instant(session.running_since))
    || (['completed', 'discarded'].includes(session.status) && !instant(session.ended_at))
    || (session.assignment_id !== null && !positive(session.assignment_id))) throw new Error('Invalid timer response');
  return session;
}
export function elapsedSeconds(session, receivedAt, now) {
  if (!session || !finite(session.elapsedSeconds)) return 0;
  const delta = session.status === 'running' && Number.isFinite(receivedAt) && Number.isFinite(now) ? Math.max(0, now - receivedAt) / 1000 : 0;
  return Math.min(MAX_SECONDS, Math.max(0, session.elapsedSeconds + delta));
}
export function formatDuration(value) {
  const seconds = finite(value) ? Math.floor(value) : 0;
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
}
export function actionsFor(session) {
  if (session?.status === 'running') return ['pause', 'finish', 'discard'];
  if (session?.status === 'paused') return session.limitReached ? ['finish', 'discard'] : ['resume', 'finish', 'discard'];
  return [];
}
export function timerError(error) {
  if (error?.data?.code === 'STUDY_TIMER_ASSIGNMENT_UNAVAILABLE') return 'studySessions.errors.assignment';
  if (error?.status === 409) return 'studySessions.errors.conflict';
  if ([401, 403].includes(error?.status)) return 'studySessions.errors.access';
  if (error?.status === 400) return 'studySessions.errors.input';
  return 'studySessions.errors.request';
}
function pagination(value) {
  if (!value || !positive(value.page) || !positive(value.size) || value.size > 100 || !finite(value.total) || !Number.isSafeInteger(value.total) || !finite(value.totalPages) || !Number.isSafeInteger(value.totalPages)) throw new Error('Invalid pagination');
  return value;
}
function normalizeSummary(summary) {
  if (!summary || summary.timeZone !== 'UTC' || summary.grouping !== 'completion_date' || !Array.isArray(summary.daily) || summary.daily.length > 93
    || !['completedSessionCount', 'totalCompletedSeconds', 'averageCompletedSeconds'].every(key => finite(summary[key]))
    || summary.daily.some(day => !validWindow({ from: day.date, to: day.date }) || !finite(day.totalCompletedSeconds) || !finite(day.completedSessionCount))) throw new Error('Invalid summary');
  return summary;
}
const fingerprint = session => session ? `${session.id}:${session.version}:${session.status}` : '';

export function createStudySessionStore(api, { now = () => performance.now(), notify = () => {} } = {}) {
  let active = true, generation = 0, sequence = 0, pendingRefresh = false;
  const requests = new Map(), listeners = new Set();
  let state = { session: null, receivedAt: 0, ready: false, currentLoading: false, busy: false, error: '', notice: '',
    filters: defaultWindow(), page: 1, history: [], summary: null, pagination: { page: 1, size: 20, total: 0, totalPages: 0 }, reportLoading: false, reportError: '',
    assignments: [], assignmentPage: 1, assignmentPages: 0, assignmentLoading: false, assignmentError: '' };
  const update = values => { if (active) { state = { ...state, ...values }; listeners.forEach(listener => listener()); } };
  const cancel = key => { requests.get(key)?.controller.abort(); requests.delete(key); };
  const begin = key => {
    cancel(key);
    const request = { id: ++sequence, generation, controller: new AbortController() };
    requests.set(key, request); return request;
  };
  const live = (key, request) => active && request.generation === generation && requests.get(key) === request;
  const acceptCurrent = (data, external = false) => {
    const session = normalizeSession(data.session);
    if (!instant(data.serverNow) || data.maxSeconds !== MAX_SECONDS || (session && !['running', 'paused'].includes(session.status))) throw new Error('Invalid current timer');
    const changed = state.ready && fingerprint(state.session) !== fingerprint(session);
    update({ session, receivedAt: now(), ready: true, ...(external && changed ? { notice: 'studySessions.changed' } : {}) });
  };
  async function loadCurrent(external = false) {
    if (!active) return;
    const request = begin('current'); update({ currentLoading: true });
    try {
      const data = await api.get(`${TIMER_BASE}/current`, { signal: request.controller.signal });
      if (!live('current', request)) return;
      acceptCurrent(data, external); update({ error: '' });
    } catch (error) { if (live('current', request) && error.name !== 'AbortError') update({ error: timerError(error), ready: false }); }
    finally { if (live('current', request)) update({ currentLoading: false }); }
  }
  async function loadReport(filters = state.filters, page = state.page) {
    if (!active) return;
    if (!validWindow(filters) || !positive(page)) { update({ reportError: 'studySessions.errors.window' }); return; }
    const request = begin('report'); update({ filters, page, reportLoading: true, reportError: '', summary: null, history: [] });
    try {
      const query = new URLSearchParams({ from: filters.from, to: filters.to });
      const [history, summary] = await Promise.all([
        api.get(`${TIMER_BASE}?${query}&page=${page}&size=20&status=${filters.status || 'all'}`, { signal: request.controller.signal }),
        api.get(`${TIMER_BASE}/summary?${query}`, { signal: request.controller.signal }),
      ]);
      if (!live('report', request)) return;
      if (!Array.isArray(history.sessions) || history.sessions.length > 100) throw new Error('Invalid history');
      const normalized = history.sessions.map(normalizeSession);
      if (normalized.some(row => !row || !['completed', 'discarded'].includes(row.status))) throw new Error('Invalid history status');
      const paging = pagination(history.pagination);
      update({ history: normalized, pagination: paging, page: paging.page, summary: normalizeSummary(summary) });
    } catch (error) { if (live('report', request) && error.name !== 'AbortError') update({ reportError: timerError(error) }); }
    finally { if (live('report', request)) update({ reportLoading: false }); }
  }
  async function loadAssignments(page = 1, search = '') {
    if (!active) return;
    const request = begin('assignments'); update({ assignmentLoading: true, assignmentError: '' });
    try {
      const query = new URLSearchParams({ page, size: 20, q: search.slice(0, 100), sort: 'due_asc' });
      const data = await api.get(`/student/me/assignments?${query}`, { signal: request.controller.signal });
      if (!live('assignments', request)) return;
      if (!Array.isArray(data.assignments) || data.assignments.length > 20 || data.assignments.some(row => !positive(row.id) || typeof row.title !== 'string')) throw new Error('Invalid assignments');
      const paging = pagination(data.pagination);
      update({ assignments: data.assignments, assignmentPage: paging.page, assignmentPages: paging.totalPages });
    } catch (error) { if (live('assignments', request) && error.name !== 'AbortError') update({ assignmentError: 'studySessions.errors.assignments', assignments: [] }); }
    finally { if (live('assignments', request)) update({ assignmentLoading: false }); }
  }
  async function refresh(external = false) {
    if (state.busy) { pendingRefresh = pendingRefresh || external; return; }
    await Promise.all([loadCurrent(external), loadReport()]);
  }
  async function mutate(action, input) {
    if (!active || state.busy || state.currentLoading || !state.ready) return null;
    const session = state.session;
    if (action === 'start' ? Boolean(session) : !actionsFor(session).includes(action)) return null;
    const body = action === 'start' ? startPayload(input?.title, input?.assignment_id) : { version: session.version };
    if (!body) { update({ error: 'studySessions.errors.input' }); return null; }
    cancel('current'); cancel('report');
    const request = begin('mutation'); update({ busy: true, error: '', notice: '', reportLoading: false });
    let result = null, failure = '';
    try {
      result = await api.post(action === 'start' ? TIMER_BASE : `${TIMER_BASE}/${session.id}/${action}`, body, { signal: request.controller.signal });
      if (!live('mutation', request)) return null;
      const saved = normalizeSession(result.session);
      if (!saved) throw new Error('Missing saved session');
      update({ session: ['running', 'paused'].includes(saved.status) ? saved : null, receivedAt: now(), notice: `studySessions.notices.${action}` });
      try { notify(); } catch {}
    } catch (error) {
      if (!live('mutation', request) || error.name === 'AbortError') return null;
      failure = timerError(error); result = null;
    }
    if (!live('mutation', request)) return null;
    await Promise.all([loadCurrent(Boolean(failure) || pendingRefresh), loadReport()]);
    if (!live('mutation', request)) return null;
    const refreshAgain = pendingRefresh;
    pendingRefresh = false;
    update({ busy: false, ...(failure ? { error: failure } : {}) });
    if (refreshAgain) {
      await refresh(true);
      if (!live('mutation', request)) return null;
      if (failure) update({ error: failure });
    }
    return result;
  }
  return { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh, loadReport, loadAssignments, mutate,
    resume: () => { active = true; },
    dispose: () => { active = false; generation++; for (const key of requests.keys()) cancel(key); state = { ...state, busy: false, currentLoading: false, reportLoading: false, assignmentLoading: false }; },
  };
}
