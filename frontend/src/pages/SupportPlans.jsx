import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { Button } from '../components/ui/Button';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { formatNotificationDate, toPositiveSafeInteger } from '../utils/notifications';
import { PLAN_STATUSES, TASK_STATUSES, canComplete, canEditTasks, createSupportPlanStore,
  draftError, draftPayload, editableDraft, emptyDraft, emptyTask, supportPlanBase, taskPayload } from '../utils/supportPlans';

const inputStyle = 'w-full min-h-11 rounded-lg border border-divider bg-surface px-3 py-2 text-ink focus-ring disabled:opacity-50';

function Field({ label, children }) {
  return <label className="block min-w-0 space-y-1.5 text-sm font-medium text-ink"><span>{label}</span>{children}</label>;
}
function Progress({ plan, t }) {
  const value = Number.isFinite(plan.progressPercent) ? plan.progressPercent : 0;
  return <div className="space-y-1.5">
    <p className="text-sm text-ink-muted">{t('supportPlans.progress', { completed: plan.completedTaskCount, total: plan.totalTaskCount, percent: Math.round(value) })}</p>
    <progress className="h-2 w-full accent-primary-600" max="100" value={value} aria-label={t('supportPlans.progressLabel')} />
  </div>;
}

export default function SupportPlans() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const selectedStudent = toPositiveSafeInteger(params.get('studentId'));
  return <SupportPlansContent key={`${user?.id}:${user?.role}:${user?.studentId}:${selectedStudent}`} user={user} selectedStudent={selectedStudent} />;
}

function SupportPlansContent({ user, selectedStudent }) {
  const { t, lang } = useLanguage();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const [studentInput, setStudentInput] = useState(params.get('studentId') || '');
  const [localError, setLocalError] = useState('');
  const base = supportPlanBase(user?.role, selectedStudent);
  const store = useMemo(() => createSupportPlanStore(api, base), [base, user?.id]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [editor, setEditor] = useState(() => {
    const draft = location.state?.supportPlanDraft;
    return isAdmin && selectedStudent && selectedStudent === location.state?.supportPlanStudentId && !draftError(draft)
      ? draft : null;
  });
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const date = value => formatNotificationDate(value, lang) || t('supportPlans.noDate');

  useEffect(() => {
    store.resume();
    store.loadList(1, 'all');
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    if (location.state?.supportPlanDraft) {
      setParams(params, { replace: true, state: null });
    }
  }, [location.state, params, setParams]);

  function selectStudent(event) {
    event.preventDefault();
    const id = toPositiveSafeInteger(studentInput.trim());
    if (!id) { setLocalError('supportPlans.invalidStudent'); return; }
    setParams({ studentId: String(id) });
  }
  function openEditor(plan = null) {
    setFormError(''); setEditId(plan?.id || null);
    setEditor(plan ? editableDraft(plan) : emptyDraft());
  }
  function updateDraft(key, value) { setEditor(current => ({ ...current, [key]: value })); }
  function updateTask(index, key, value) {
    setEditor(current => ({ ...current, tasks: current.tasks.map((task, i) => i === index ? { ...task, [key]: value } : task) }));
  }
  async function saveDraft(event) {
    event.preventDefault();
    const error = draftError(editor);
    if (error) { setFormError(error); return; }
    setFormError('');
    const result = await store.mutate(editId ? 'patch' : 'post', editId ? `/${editId}` : '', draftPayload(editor));
    if (result) { setEditor(null); setEditId(null); }
  }
  async function transition() {
    if (!confirmation) return;
    const { action, id, version } = confirmation;
    const result = await store.mutate('post', `/${id}/${action}`, { version });
    const error = store.getSnapshot().error;
    if (result || error === 'supportPlans.conflict' || error === 'supportPlans.invalidAction') setConfirmation(null);
  }
  const closeEditor = () => { if (!state.busy) { setEditor(null); setFormError(''); } };
  const error = localError || state.error;
  const statuses = PLAN_STATUSES.filter(status => isAdmin || status !== 'draft');

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="text-2xl font-bold text-ink">{t('supportPlans.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t(isAdmin ? 'supportPlans.staffIntro' : 'supportPlans.studentIntro')}</p></div>
      {isAdmin && <Button onClick={() => openEditor()} disabled={!base || state.busy}>{t('supportPlans.create')}</Button>}
    </header>
    <p className="text-sm text-ink-muted">{t('supportPlans.progressHelp')}</p>
    {isAdmin && <form onSubmit={selectStudent} className="flex flex-wrap items-end gap-3 rounded-xl border border-divider bg-surface p-4">
      <div className="w-full sm:w-64"><Field label={t('supportPlans.studentId')}><input className={inputStyle} inputMode="numeric" value={studentInput} onChange={event => setStudentInput(event.target.value)} disabled={state.busy} /></Field></div>
      <Button type="submit" variant="secondary" disabled={state.busy}>{t('supportPlans.loadStudent')}</Button>
      <p className="w-full text-sm text-ink-muted">{t('supportPlans.adminOnly')}</p>
    </form>}
    {!base && <p className="rounded-xl border border-divider bg-surface p-6 text-ink-muted">{t('supportPlans.chooseStudent')}</p>}
    {error && <div role="alert" className="space-y-3 rounded-xl border border-danger-300 bg-danger-50 p-4 text-danger-800 dark:bg-danger-950/30 dark:text-danger-200">
      <p>{t(error)}</p><Button variant="secondary" disabled={state.busy || !base} onClick={() => { setLocalError(''); store.loadList(); if (state.plan) store.loadPlan(state.plan.id); }}>{t('supportPlans.refresh')}</Button>
    </div>}
    {state.warnings.length > 0 && <p role="status" className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-warning-800 dark:bg-warning-950/30 dark:text-warning-200">{t('supportPlans.optionalWarning')}</p>}
    {base && <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-56"><Field label={t('supportPlans.filter')}><select className={inputStyle} value={state.status} disabled={state.busy} onChange={event => { store.clearPlan(); store.loadList(1, event.target.value); }}>
          <option value="all">{t('supportPlans.all')}</option>{statuses.map(status => <option key={status} value={status}>{t(`supportPlans.status.${status}`)}</option>)}
        </select></Field></div>
        <Button variant="secondary" onClick={() => { store.loadList(); if (state.plan) store.loadPlan(state.plan.id); }} disabled={state.busy || state.listLoading}>{t('supportPlans.refresh')}</Button>
      </div>
      {state.listLoading ? <p role="status">{t('supportPlans.loading')}</p> : state.plans.length === 0 ? <p className="rounded-xl border border-divider bg-surface p-6 text-ink-muted">{t('supportPlans.empty')}</p> :
        <ul className="grid gap-3 md:grid-cols-2">{state.plans.map(plan => <li key={plan.id} className="min-w-0 rounded-xl border border-divider bg-surface p-4">
          <div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="break-words font-semibold">{plan.title}</h2><span className="text-sm">{t(`supportPlans.status.${plan.status}`)}</span></div>
          {plan.isOverdue && <p className="mb-2 text-sm font-semibold">{t('supportPlans.overdue')}</p>}
          <Progress plan={plan} t={t} /><p className="my-3 text-sm text-ink-muted">{t('supportPlans.due')}: {date(plan.due_date)}</p>
          <Button variant="secondary" disabled={state.busy} onClick={() => store.loadPlan(plan.id)} aria-label={t('supportPlans.viewNamed', { title: plan.title })}>{t('supportPlans.view')}</Button>
        </li>)}</ul>}
      <nav aria-label={t('supportPlans.pagination')} className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" disabled={state.page <= 1 || state.listLoading || state.busy} onClick={() => store.loadList(state.page - 1)}>{t('supportPlans.previous')}</Button>
        <span className="text-sm text-ink-muted">{t('supportPlans.page', { page: state.page, pages: Math.max(1, state.totalPages), total: state.total })}</span>
        <Button variant="ghost" disabled={state.page >= state.totalPages || state.listLoading || state.busy} onClick={() => store.loadList(state.page + 1)}>{t('supportPlans.next')}</Button>
      </nav>
    </>}
    {state.detailLoading && <p role="status">{t('supportPlans.loading')}</p>}
    {state.plan && <section aria-labelledby="support-plan-detail" className="space-y-4 rounded-xl border border-divider bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap justify-between gap-3"><h2 id="support-plan-detail" className="break-words text-xl font-semibold">{state.plan.title}</h2>
        <Button variant="ghost" disabled={state.busy} onClick={() => store.clearPlan()}>{t('supportPlans.close')}</Button></div>
      <p className="whitespace-pre-wrap break-words text-ink-muted">{state.plan.objective}</p>
      <p className="text-sm">{t(`supportPlans.status.${state.plan.status}`)}{state.plan.isOverdue ? ` · ${t('supportPlans.overdue')}` : ''}</p>
      <p className="text-sm text-ink-muted">{t('supportPlans.start')}: {date(state.plan.start_date)} · {t('supportPlans.due')}: {date(state.plan.due_date)}</p>
      <Progress plan={state.plan} t={t} />
      <p className="text-sm text-ink-muted">{t('supportPlans.utcHelp')}</p>
      {!canEditTasks(state.plan) && <p className="text-sm">{t(state.plan.status === 'draft' ? 'supportPlans.draftHelp' : 'supportPlans.readOnly')}</p>}
      <h3 className="font-semibold">{t('supportPlans.tasks')}</h3>
      {!state.plan.tasks.length && <p className="text-sm text-ink-muted">{t('supportPlans.noTasks')}</p>}
      <ol className="space-y-3">{state.plan.tasks.map(task => <li key={task.id} className="space-y-2 rounded-lg border border-divider p-3">
        <h4 className="break-words font-semibold">{task.title}</h4>
        {task.description && <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{task.description}</p>}
        <p className="text-sm text-ink-muted">{t('supportPlans.due')}: {date(task.due_date)}</p>
        {canEditTasks(state.plan) ? <div className="max-w-sm"><Field label={t('supportPlans.taskStatus')}><select className={inputStyle} value={task.status} disabled={state.busy} onChange={event => store.mutate('patch', `/${state.plan.id}/tasks/${task.id}`, taskPayload(state.plan, task, event.target.value))}>
          {TASK_STATUSES.map(status => <option key={status} value={status}>{t(`supportPlans.taskStatuses.${status}`)}</option>)}
        </select></Field></div> : <p className="text-sm">{t(`supportPlans.taskStatuses.${task.status}`)}</p>}
      </li>)}</ol>
      {isAdmin && <div className="flex flex-wrap gap-2">
        {state.plan.status === 'draft' && <><Button variant="secondary" disabled={state.busy} onClick={() => openEditor(state.plan)}>{t('supportPlans.edit')}</Button>
          <Button disabled={state.busy || !state.plan.totalTaskCount} onClick={() => setConfirmation({ action: 'activate', id: state.plan.id, version: state.plan.version })}>{t('supportPlans.activate')}</Button></>}
        {state.plan.status === 'active' && <Button disabled={state.busy || !canComplete(state.plan)} onClick={() => setConfirmation({ action: 'complete', id: state.plan.id, version: state.plan.version })}>{t('supportPlans.complete')}</Button>}
        {['draft', 'active'].includes(state.plan.status) && <Button variant="danger" disabled={state.busy} onClick={() => setConfirmation({ action: 'cancel', id: state.plan.id, version: state.plan.version })}>{t('supportPlans.cancelPlan')}</Button>}
      </div>}
    </section>}
    <Modal isOpen={Boolean(editor)} onClose={closeEditor} title={t(editId ? 'supportPlans.edit' : 'supportPlans.create')} size="lg" showCloseButton={!state.busy} closeOnEscape={!state.busy} closeOnOverlayClick={!state.busy}>
      {editor && <form onSubmit={saveDraft} className="space-y-4" noValidate>
        <p className="text-sm text-ink-muted">{t('supportPlans.reviewHelp')}</p>
        {(formError || state.error) && <p role="alert" className="text-danger-700 dark:text-danger-300">{t(formError || state.error)}</p>}
        <fieldset disabled={state.busy} className="space-y-4">
          <Field label={t('supportPlans.planTitle')}><input className={inputStyle} value={editor.title} maxLength={150} required onChange={event => updateDraft('title', event.target.value)} /></Field>
          <Field label={t('supportPlans.objective')}><textarea className={inputStyle} rows={4} value={editor.objective} maxLength={2000} required onChange={event => updateDraft('objective', event.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={t('supportPlans.start')}><input className={inputStyle} type="date" value={editor.start_date} required onChange={event => updateDraft('start_date', event.target.value)} /></Field>
            <Field label={t('supportPlans.due')}><input className={inputStyle} type="date" value={editor.due_date} required onChange={event => updateDraft('due_date', event.target.value)} /></Field></div>
          <p className="text-sm text-ink-muted">{t('supportPlans.utcHelp')}</p>
          <h3 className="font-semibold">{t('supportPlans.tasks')} ({editor.tasks.length}/20)</h3>
          {editor.tasks.map((task, index) => <fieldset key={index} className="space-y-3 rounded-lg border border-divider p-3">
            <legend className="px-1 text-sm font-semibold">{t('supportPlans.taskNumber', { number: index + 1 })}</legend>
            <Field label={t('supportPlans.taskTitle')}><input className={inputStyle} value={task.title} maxLength={150} required onChange={event => updateTask(index, 'title', event.target.value)} /></Field>
            <Field label={t('supportPlans.description')}><textarea className={inputStyle} value={task.description} maxLength={1000} rows={2} onChange={event => updateTask(index, 'description', event.target.value)} /></Field>
            <Field label={t('supportPlans.taskDue')}><input className={inputStyle} type="date" value={task.due_date} onChange={event => updateTask(index, 'due_date', event.target.value)} /></Field>
            <Button variant="ghost" onClick={() => updateDraft('tasks', editor.tasks.filter((_, i) => i !== index))}>{t('supportPlans.removeTask')}</Button>
          </fieldset>)}
          <Button variant="secondary" disabled={editor.tasks.length >= 20} onClick={() => updateDraft('tasks', [...editor.tasks, emptyTask()])}>{t('supportPlans.addTask')}</Button>
        </fieldset>
        <div className="flex flex-wrap gap-2 border-t border-divider pt-4"><Button type="submit" loading={state.busy}>{t('supportPlans.saveDraft')}</Button>
          <Button variant="ghost" disabled={state.busy} onClick={closeEditor}>{t('supportPlans.close')}</Button>
          {editId && state.error === 'supportPlans.conflict' && state.plan?.id === editId && state.plan.status === 'draft' && <Button variant="secondary" disabled={state.busy} onClick={() => { setEditor(editableDraft(state.plan)); setFormError(''); }}>{t('supportPlans.reloadDraft')}</Button>}
        </div>
      </form>}
    </Modal>
    <ConfirmDialog isOpen={Boolean(confirmation)} onClose={() => { if (!state.busy) setConfirmation(null); }} onConfirm={transition}
      loading={state.busy} title={t('supportPlans.confirmTitle')} message={<>
        <span>{t(`supportPlans.confirm.${confirmation?.action || 'activate'}`)}</span>
        {state.error && <span role="alert" className="mt-3 block text-danger-700 dark:text-danger-300">{t(state.error)}</span>}
      </>}
      confirmText={t('supportPlans.confirmAction')} variant={confirmation?.action === 'cancel' ? 'danger' : 'info'} />
  </div>;
}
