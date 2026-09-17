import { isCalendarDate, toPositiveSafeInteger } from './notifications.js';

export const PLAN_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'];
export const emptyTask = () => ({ title: '', description: '', due_date: '' });

export function emptyDraft(now = new Date()) {
  return { title: '', objective: '', start_date: now.toISOString().slice(0, 10),
    due_date: new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10), tasks: [] };
}
function validDate(value) {
  return typeof value === 'string' && /^[1-9]\d{3}-/.test(value) && isCalendarDate(value);
}
function validText(value, limit, required = true) {
  return typeof value === 'string' && (!required || value.trim().length > 0) && value.trim().length <= limit
    && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}
export function draftError(draft) {
  if (!draft || !validText(draft.title, 150) || !validText(draft.objective, 2000)) return 'supportPlans.invalidContent';
  if (!validDate(draft.start_date) || !validDate(draft.due_date) || draft.due_date < draft.start_date) return 'supportPlans.invalidDates';
  if (!Array.isArray(draft.tasks) || draft.tasks.length > 20) return 'supportPlans.invalidTasks';
  for (const task of draft.tasks) {
    if (!validText(task?.title, 150) || !validText(task?.description ?? '', 1000, false)) return 'supportPlans.invalidTasks';
    if (task.due_date && (!validDate(task.due_date) || task.due_date < draft.start_date || task.due_date > draft.due_date)) return 'supportPlans.invalidDates';
  }
  return '';
}
export function draftPayload(draft) {
  const error = draftError(draft);
  if (error) throw new Error(error);
  return { title: draft.title.trim(), objective: draft.objective.trim(), start_date: draft.start_date, due_date: draft.due_date,
    tasks: draft.tasks.map(task => ({ title: task.title.trim(), description: (task.description || '').trim(), due_date: task.due_date || null })),
    ...(toPositiveSafeInteger(draft.version) ? { version: Number(draft.version) } : {}) };
}
export function editableDraft(plan) {
  return { ...emptyDraft(), title: plan.title, objective: plan.objective, start_date: plan.start_date, due_date: plan.due_date,
    version: plan.version, tasks: plan.tasks.map(task => ({ title: task.title, description: task.description || '', due_date: task.due_date || '' })) };
}

export function prefillIntervention(note, t, now = new Date()) {
  const result = { ...emptyDraft(now), title: t('supportPlans.suggestedTitle'), objective: t('supportPlans.suggestedObjective') };
  if (typeof note !== 'string' || note.length > 16000) return result;
  const section = note.split('--- RECOMMENDATIONS ---')[1]?.split(/--- CUSTOM NOTES ---|=== END OF NOTE ===/)[0] || '';
  result.tasks = section.split('\n').filter(line => /^\s*\*\s+/.test(line)).slice(0, 20).map(line => ({
    title: line.replace(/^\s*\*\s+/, '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 150), description: '', due_date: '',
  })).filter(task => task.title);
  return result;
}

export function supportPlanBase(role, studentId) {
  if (role === 'student') return '/student/me/support-plans';
  const id = toPositiveSafeInteger(studentId);
  return role === 'admin' && id ? `/admin/students/${id}/support-plans` : null;
}
export function canEditTasks(plan) { return plan?.status === 'active'; }
export function canComplete(plan) {
  return plan?.status === 'active' && plan.totalTaskCount > 0 && plan.completedTaskCount === plan.totalTaskCount;
}
export function taskPayload(plan, task, status) {
  if (!canEditTasks(plan) || !TASK_STATUSES.includes(status) || !toPositiveSafeInteger(plan.version) || !toPositiveSafeInteger(task?.version)) {
    throw new Error('supportPlans.invalidAction');
  }
  return { status, version: Number(task.version), planVersion: Number(plan.version) };
}
export function supportError(error) {
  if (error?.status === 409) return error?.data?.code === 'SUPPORT_PLAN_INVALID_TRANSITION' ? 'supportPlans.invalidAction' : 'supportPlans.conflict';
  if (error?.status === 401 || error?.status === 403) return 'supportPlans.forbidden';
  if (error?.status === 404) return 'supportPlans.notFound';
  if (error?.status === 400) return 'supportPlans.invalidInput';
  return 'supportPlans.requestError';
}

export function createSupportPlanStore(api, base) {
  let state = { plans: [], plan: null, page: 1, total: 0, totalPages: 0, status: 'all', listLoading: false,
    detailLoading: false, busy: false, error: '', warnings: [] };
  let active = true;
  let listSequence = 0;
  let detailSequence = 0;
  let mutationSequence = 0;
  const listeners = new Set();
  function update(patch) {
    if (!active) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  async function loadList(page = state.page, status = state.status) {
    if (!active || !base) return;
    const sequence = ++listSequence;
    update({ listLoading: true, page, status, error: '' });
    try {
      const params = new URLSearchParams({ page: String(page), size: '20' });
      if (status !== 'all') params.set('status', status);
      const data = await api.get(`${base}?${params}`);
      if (!active || sequence !== listSequence) return;
      const total = Number(data.total);
      const totalPages = Number(data.totalPages);
      if (!Array.isArray(data.plans) || !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(totalPages) || totalPages < 0) throw new Error('Invalid page');
      if (page > Math.max(1, totalPages)) return loadList(Math.max(1, totalPages), status);
      update({ plans: data.plans, total, totalPages });
    } catch (error) {
      if (sequence === listSequence) update({ error: supportError(error), plans: [] });
    } finally {
      if (sequence === listSequence) update({ listLoading: false });
    }
  }
  async function loadPlan(id) {
    if (!active) return;
    const sequence = ++detailSequence;
    update({ plan: null, detailLoading: true, error: '', warnings: [] });
    try {
      if (!toPositiveSafeInteger(id) || !base) throw new Error('Invalid plan');
      const data = await api.get(`${base}/${id}`);
      if (!data.plan || !Array.isArray(data.plan.tasks)) throw new Error('Invalid plan');
      if (sequence === detailSequence) update({ plan: data.plan });
    } catch (error) {
      if (sequence === detailSequence) update({ error: supportError(error) });
    } finally {
      if (sequence === detailSequence) update({ detailLoading: false });
    }
  }
  async function mutate(method, suffix, body) {
    if (!active || state.busy || !base) return null;
    const sequence = ++mutationSequence;
    const selected = ++detailSequence;
    update({ busy: true, detailLoading: false, error: '', warnings: [] });
    try {
      const data = await api[method](`${base}${suffix}`, body);
      if (!active || sequence !== mutationSequence || selected !== detailSequence) return null;
      if (!data.plan || !Array.isArray(data.plan.tasks)) throw new Error('Invalid plan');
      update({ plan: data.plan, warnings: Array.isArray(data.warnings) ? data.warnings : [] });
      await loadList();
      if (!active || sequence !== mutationSequence || selected !== detailSequence) return null;
      return data;
    } catch (error) {
      if (active && sequence === mutationSequence && selected === detailSequence) {
        let expectedDetail = detailSequence;
        if (error?.status === 409 && state.plan?.id) {
          expectedDetail += 1;
          await loadPlan(state.plan.id);
        }
        if (active && sequence === mutationSequence && expectedDetail === detailSequence) update({ error: supportError(error) });
      }
      return null;
    } finally {
      if (sequence === mutationSequence) update({ busy: false });
    }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state, loadList, loadPlan, mutate,
    clearPlan() { detailSequence += 1; update({ plan: null, detailLoading: false }); },
    resume() { active = true; update({ busy: false, detailLoading: false }); },
    dispose() { active = false; listSequence += 1; detailSequence += 1; mutationSequence += 1; },
  };
}
