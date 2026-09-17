export const JOURNAL_BASE = '/student/me/learning-journal';
export const DEFAULT_FILTERS = { q: '', from: '', to: '', rating: '' };
export const TEXT_LIMITS = { title: 150, learned_text: 3000, difficulties_text: 2000, next_steps_text: 2000 };
export function utcToday() { return new Date().toISOString().slice(0, 10); }
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function newDraft(today = utcToday()) {
  return { title: '', entry_date: today, learned_text: '', difficulties_text: '', next_steps_text: '', understanding_rating: '' };
}
export function toDraft(entry) {
  return { ...Object.fromEntries(Object.keys(TEXT_LIMITS).map(key => [key, entry[key]])), entry_date: entry.entry_date, understanding_rating: entry.understanding_rating == null ? '' : String(entry.understanding_rating) };
}
export function validateDraft(draft, today = utcToday()) {
  const errors = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    const text = draft[key];
    if (typeof text !== 'string' || text.trim().length > max || (['title', 'learned_text'].includes(key) && !text.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || (key === 'title' && /[\r\n\t]/.test(text))) errors[key] = 'learningJournal.invalidText';
  }
  if (!validDate(draft.entry_date) || draft.entry_date > today) errors.entry_date = 'learningJournal.invalidDate';
  if (!['', '1', '2', '3', '4', '5'].includes(draft.understanding_rating)) errors.understanding_rating = 'learningJournal.invalidRating';
  return errors;
}
export function payload(draft, version) {
  return { ...Object.fromEntries(Object.keys(TEXT_LIMITS).map(key => [key, draft[key].trim()])), entry_date: draft.entry_date,
    understanding_rating: draft.understanding_rating === '' ? null : Number(draft.understanding_rating), ...(version === null ? {} : { version }) };
}
export function validFilters(filters) {
  return typeof filters.q === 'string' && filters.q.length <= 100 && !/[\x00-\x1f\x7f]/.test(filters.q)
    && (!filters.from || validDate(filters.from)) && (!filters.to || validDate(filters.to))
    && (!filters.from || !filters.to || (filters.from <= filters.to && (new Date(filters.to) - new Date(filters.from)) / 86400000 < 366))
    && ['', '1', '2', '3', '4', '5'].includes(filters.rating);
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function normalizeEntry(entry, full = true) {
  if (!entry || !positive(entry.id) || !positive(entry.version) || entry.version > 4294967295 || !validDate(entry.entry_date)
    || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 150
    || (entry.understanding_rating !== null && (!Number.isInteger(entry.understanding_rating) || entry.understanding_rating < 1 || entry.understanding_rating > 5))) throw new Error('Invalid journal response');
  if (full && Object.keys(TEXT_LIMITS).some(key => typeof entry[key] !== 'string' || entry[key].length > TEXT_LIMITS[key])) throw new Error('Invalid journal response');
  if (!full && (typeof entry.learned_preview !== 'string' || [...entry.learned_preview].length > 200)) throw new Error('Invalid journal preview');
  return entry;
}
export function errorKey(error, writing = false) {
  if (error?.status === 409) return 'learningJournal.conflict';
  if (error?.status === 404) return 'learningJournal.notFound';
  if ([401, 403].includes(error?.status)) return 'learningJournal.access';
  if (error?.status === 400) return 'learningJournal.invalidInput';
  if (error?.status === 429) return 'learningJournal.rateLimited';
  return writing ? 'learningJournal.saveFailed' : 'learningJournal.requestFailed';
}
export function isDirty(state) { return Boolean(state.draft && JSON.stringify(state.draft) !== state.baseline); }
export function listState(state) { return state.loading ? 'loading' : state.error ? 'error' : state.entries.length ? 'ready' : 'empty'; }
export function createJournalStore(api) {
  let active = true, generation = 0;
  const listeners = new Set(), requests = new Map();
  let state = { entries: [], filters: { ...DEFAULT_FILTERS }, pagination: { page: 1, size: 20, total: 0, totalPages: 0 }, today: utcToday(),
    loading: false, error: '', notice: '', mode: null, entryId: null, entry: null, detailLoading: false,
    draft: null, baseline: null, version: null, errors: {}, formError: '', conflicted: false, discardAction: null, busy: false };
  const update = patch => { if (active) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); } };
  const cancel = key => { requests.get(key)?.controller.abort(); requests.delete(key); };
  const begin = key => { cancel(key); const request = { generation, controller: new AbortController() }; requests.set(key, request); return request; };
  const live = (key, request) => active && generation === request.generation && requests.get(key) === request;
  const clearDialog = () => { cancel('detail'); update({ mode: null, entryId: null, entry: null, draft: null, baseline: null, version: null, errors: {}, formError: '', conflicted: false, discardAction: null, detailLoading: false }); };
  async function load(filters = state.filters, page = state.pagination.page) {
    if (!active) return;
    if (!validFilters(filters) || !positive(page) || (page - 1) * 20 > 100000) { update({ error: 'learningJournal.invalidFilters' }); return; }
    const request = begin('list');
    update({ loading: true, error: '', filters: { ...filters }, entries: [] });
    const query = new URLSearchParams({ page, size: 20, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')) });
    try {
      const result = await api.get(`${JOURNAL_BASE}?${query}`, { signal: request.controller.signal });
      if (!live('list', request)) return;
      const p = result.pagination;
      if (!Array.isArray(result.entries) || result.entries.length > 20 || !p || !positive(p.page) || p.size !== 20 || !Number.isSafeInteger(p.total) || p.total < 0 || !Number.isSafeInteger(p.totalPages) || p.totalPages < 0 || p.totalPages > 5001 || !validDate(result.today) || result.timeZone !== 'UTC') throw new Error('Invalid journal list');
      update({ entries: result.entries.map(entry => normalizeEntry(entry, false)), pagination: p, today: result.today });
    } catch (error) { if (live('list', request)) update({ error: errorKey(error) }); }
    finally { if (live('list', request)) update({ loading: false }); }
  }
  async function readEntry(id) {
    const request = begin('detail'); update({ detailLoading: true, formError: '', entry: null });
    try {
      const result = await api.get(`${JOURNAL_BASE}/${id}`, { signal: request.controller.signal });
      if (!live('detail', request)) return;
      const entry = normalizeEntry(result.entry);
      if (entry.id !== id) throw new Error('Invalid journal identity');
      update({ entry });
    } catch (error) { if (live('detail', request)) update({ formError: errorKey(error) }); }
    finally { if (live('detail', request)) update({ detailLoading: false }); }
  }
  function open(id) {
    if (!active || state.busy || isDirty(state) || !positive(id)) return;
    clearDialog(); update({ mode: 'view', entryId: id }); return readEntry(id);
  }
  function create() {
    if (!active || state.busy || state.mode) return;
    const draft = newDraft(state.today);
    update({ mode: 'create', draft, baseline: JSON.stringify(draft), version: null, notice: '', formError: '', errors: {} });
  }
  function edit() {
    if (state.busy || state.detailLoading || state.mode !== 'view' || !state.entry) return;
    const draft = toDraft(state.entry);
    update({ mode: 'edit', draft, baseline: JSON.stringify(draft), version: state.entry.version, errors: {}, formError: '', conflicted: false });
  }
  function change(key, value) {
    if (!state.draft || state.busy || !(key in state.draft)) return;
    update({ draft: { ...state.draft, [key]: value }, errors: { ...state.errors, [key]: undefined } });
  }
  function close() {
    if (state.busy) return;
    if (isDirty(state)) update({ discardAction: 'close' }); else clearDialog();
  }
  function reload() {
    if (state.busy || !state.entryId) return;
    if (isDirty(state)) update({ discardAction: 'reload' });
    else { const id = state.entryId; clearDialog(); return open(id); }
  }
  function discardEdits() {
    if (state.busy || !state.discardAction) return;
    const action = state.discardAction, id = state.entryId;
    clearDialog(); if (action === 'reload') return open(id);
  }
  async function save() {
    if (!active || state.busy || state.conflicted || !['create', 'edit'].includes(state.mode)) return false;
    const errors = validateDraft(state.draft, state.today);
    if (Object.keys(errors).length) { update({ errors }); return false; }
    const request = begin('write'), id = state.entryId, body = payload(state.draft, state.version);
    update({ busy: true, formError: '', errors: {} });
    try {
      const result = await (id ? api.patch(`${JOURNAL_BASE}/${id}`, body, { signal: request.controller.signal }) : api.post(JOURNAL_BASE, body, { signal: request.controller.signal }));
      if (!live('write', request)) return false;
      if (!positive(result.id) || !positive(result.version) || (id && result.id !== id)) throw new Error('Invalid save response');
      update({ mode: 'view', entryId: result.id, draft: null, baseline: null, version: null, notice: 'learningJournal.saved', conflicted: false });
      await Promise.all([readEntry(result.id), load()]);
      return true;
    } catch (error) {
      if (live('write', request)) update({ formError: errorKey(error, true), conflicted: error?.status === 409 });
      return false;
    } finally { if (live('write', request)) update({ busy: false }); }
  }
  function confirmDelete() {
    if (state.busy || state.mode !== 'view' || !state.entry || state.detailLoading) return;
    update({ mode: 'delete', formError: '', conflicted: false });
  }
  async function remove() {
    if (!active || state.busy || state.conflicted || state.mode !== 'delete' || !state.entry) return false;
    const request = begin('write'), entry = state.entry;
    update({ busy: true, formError: '' });
    try {
      const result = await api.delete(`${JOURNAL_BASE}/${entry.id}?version=${entry.version}`, { signal: request.controller.signal });
      if (!live('write', request)) return false;
      if (result?.ok !== true) throw new Error('Invalid delete response');
      clearDialog(); update({ notice: 'learningJournal.deleted' }); await load(); return true;
    } catch (error) {
      if (live('write', request)) update({ formError: errorKey(error, true), conflicted: error?.status === 409 });
      return false;
    } finally { if (live('write', request)) update({ busy: false }); }
  }
  return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, load, open, create, edit, change, close, reload, discardEdits, save, confirmDelete, remove,
    keepEditing: () => update({ discardAction: null }), cancelDelete: () => { if (!state.busy) update({ mode: 'view', formError: '', conflicted: false }); },
    resume: () => { active = true; }, dispose: () => { active = false; generation++; for (const key of requests.keys()) cancel(key); } };
}
