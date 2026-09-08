import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { Button, Card, PageHeader, ConfirmDialog } from '../components/ui';
import { CHART_THEME, getChartOptions } from '../utils/chartTheme';
import { MAX_SECONDS, actionsFor, createStudySessionStore, defaultWindow, elapsedSeconds, formatDuration, instant, startPayload } from '../utils/studySessions';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function TimerDisplay({ session, receivedAt, onLimit }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => performance.now());
  const reconciled = useRef('');
  useEffect(() => {
    setNow(performance.now());
    if (session.status !== 'running') return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session.id, session.status, receivedAt]);
  const seconds = elapsedSeconds(session, receivedAt, now);
  useEffect(() => {
    const key = `${session.id}:${session.version}`;
    if (seconds >= MAX_SECONDS && session.status === 'running' && reconciled.current !== key) {
      reconciled.current = key; onLimit();
    }
  }, [seconds, session.id, session.version, session.status, onLimit]);
  return <div>
    <p className="text-sm text-ink-muted">{t('studySessions.elapsed')}</p>
    <p role="timer" aria-live="off" aria-label={t('studySessions.elapsed')} className="my-3 font-mono text-4xl font-bold tabular-nums sm:text-5xl">{formatDuration(seconds)}</p>
    {(session.limitReached || seconds >= MAX_SECONDS) && <p className="text-warning-700 dark:text-warning-300">{t('studySessions.limit')}</p>}
  </div>;
}
function DailyChart({ summary }) {
  const { t, lang } = useLanguage();
  const { isDark } = useTheme();
  const options = useMemo(() => {
    const base = getChartOptions(isDark);
    return { ...base, plugins: { ...base.plugins, legend: { display: false } },
      scales: { ...base.scales, y: { ...base.scales.y, title: { ...base.scales.y.title, display: true, text: t('studySessions.minutes') } } } };
  }, [isDark, t]);
  const data = useMemo(() => ({
    labels: summary.daily.map(day => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(instant(`${day.date}T00:00:00Z`))),
    datasets: [{ label: t('studySessions.minutes'), data: summary.daily.map(day => day.totalCompletedSeconds / 60), backgroundColor: (isDark ? CHART_THEME.dark : CHART_THEME.light).primary.solid }],
  }), [summary, isDark, lang, t]);
  return <Card padding="lg">
    <h2 className="text-lg font-bold">{t('studySessions.daily')}</h2>
    <p className="mt-2 text-sm text-ink-muted">{t('studySessions.grouping')}</p>
    <div className="mt-4 h-64 min-w-0"><Bar data={data} options={options} role="img" aria-label={t('studySessions.daily')} /></div>
    <details className="mt-4">
      <summary className="focus-ring min-h-11 cursor-pointer rounded-lg py-3">{t('studySessions.table')}</summary>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-3" scope="col">{t('studySessions.date')}</th><th className="p-3" scope="col">{t('studySessions.completedCount')}</th><th className="p-3" scope="col">{t('studySessions.duration')}</th></tr></thead>
        <tbody>{summary.daily.map(day => <tr key={day.date} className="border-t border-divider"><th className="p-3" scope="row">{day.date}</th><td className="p-3">{day.completedSessionCount.toLocaleString(lang)}</td><td className="p-3 font-mono">{formatDuration(day.totalCompletedSeconds)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </Card>;
}
export default function StudySessions() {
  const { user } = useAuth();
  return <StudySessionsContent key={`${user?.id}:${user?.role}:${user?.studentId}`} user={user} />;
}
function StudySessionsContent({ user }) {
  const { t, lang } = useLanguage();
  const channel = useRef(null);
  const store = useMemo(() => createStudySessionStore(api, { notify: () => channel.current?.postMessage({ type: 'changed' }) }), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [title, setTitle] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [filters, setFilters] = useState(defaultWindow);
  const [discard, setDiscard] = useState(null);
  const reconcile = useMemo(() => () => store.refresh(true), [store]);
  useEffect(() => {
    store.resume(); store.refresh(); store.loadAssignments();
    const onFocus = () => { if (document.visibilityState === 'visible') store.refresh(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    try {
      channel.current = new BroadcastChannel(`study-timer:${user.id}:${user.studentId}`);
      channel.current.onmessage = event => { if (event.data?.type === 'changed') store.refresh(true); };
    } catch { channel.current = null; }
    return () => {
      window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus);
      channel.current?.close(); channel.current = null; store.dispose();
    };
  }, [store, user.id, user.studentId]);
  const disabled = state.busy || state.currentLoading || !state.ready;
  const formatInstant = value => {
    const date = instant(value);
    return date ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) : t('studySessions.notSet');
  };
  const start = async event => {
    event.preventDefault();
    const result = await store.mutate('start', startPayload(title, assignmentId));
    if (result) { setTitle(''); setAssignmentId(''); }
  };
  const findAssignments = (page = 1) => { setAssignmentId(''); store.loadAssignments(page, assignmentSearch); };
  const discardCurrent = state.session?.id === discard?.id && state.session?.version === discard?.version;
  return <div className="mx-auto max-w-7xl space-y-6">
    <PageHeader title={t('studySessions.title')} subtitle={t('studySessions.subtitle')} />
    <p className="text-sm text-ink-muted">{t('studySessions.privacy')}</p>
    <div role="status" aria-live="polite" aria-atomic="true" className="text-sm text-ink-muted">{state.notice ? t(state.notice) : ''}</div>
    {state.error && <div role="alert" className="rounded-xl border border-danger-300 bg-danger-50 p-4 text-danger-700 dark:bg-danger-950 dark:text-danger-200">
      <p>{t(state.error)}</p><Button className="mt-3" variant="outline" disabled={state.busy} onClick={() => store.refresh(true)}>{t('studySessions.refresh')}</Button>
    </div>}
    <Card padding="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{t('studySessions.current')}</h2><Button variant="outline" disabled={state.busy || state.currentLoading} onClick={() => store.refresh(true)}>{t('studySessions.refresh')}</Button></div>
      {state.currentLoading && <p role="status" className="mb-3 text-ink-muted">{t('studySessions.loading')}</p>}
      {state.session ? <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words text-lg font-semibold">{state.session.title}</h3><span className="rounded-lg border border-divider px-3 py-1 text-sm">{t(`studySessions.status.${state.session.status}`)}</span></div>
        {state.session.assignment_id !== null && <p className="text-sm text-ink-muted">{t('studySessions.linked', { id: state.session.assignment_id })}</p>}
        <TimerDisplay session={state.session} receivedAt={state.receivedAt} onLimit={reconcile} />
        {state.session.clockAdjusted && <p role="status" className="text-warning-700 dark:text-warning-300">{t('studySessions.clock')}</p>}
        <p className="text-sm text-ink-muted">{t('studySessions.behavior')}</p>
        <div className="flex flex-wrap gap-3">{actionsFor(state.session).map(action => <Button key={action} disabled={disabled} variant={action === 'discard' ? 'danger' : action === 'finish' ? 'primary' : 'outline'} onClick={() => action === 'discard' ? setDiscard({ id: state.session.id, version: state.session.version }) : store.mutate(action)}>{t(`studySessions.actions.${action}`)}</Button>)}</div>
      </div> : <form className="space-y-4" onSubmit={start}>
        <p className="text-sm text-ink-muted">{t('studySessions.noCurrent')}</p>
        <label className="block"><span className="mb-2 block text-sm font-semibold">{t('studySessions.sessionTitle')}</span><input id="study-session-title" className="input" value={title} maxLength={150} required disabled={disabled} onChange={event => setTitle(event.target.value)} /></label>
        <fieldset className="min-w-0 space-y-3 rounded-xl border border-divider p-4" disabled={disabled}>
          <legend className="px-1 text-sm font-semibold">{t('studySessions.assignment')}</legend>
          <div className="flex flex-wrap items-end gap-3"><label className="block min-w-0 flex-1"><span className="mb-2 block text-sm">{t('studySessions.assignmentSearch')}</span><input className="input" value={assignmentSearch} maxLength={100} onChange={event => setAssignmentSearch(event.target.value)} /></label><Button type="button" variant="outline" disabled={state.assignmentLoading} onClick={() => findAssignments()}>{t('studySessions.search')}</Button></div>
          <label className="block"><span className="mb-2 block text-sm">{t('studySessions.chooseAssignment')}</span><select id="study-session-assignment" className="input w-full" value={assignmentId} disabled={state.assignmentLoading} onChange={event => setAssignmentId(event.target.value)}><option value="">{t('studySessions.standalone')}</option>{state.assignments.map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select></label>
          {state.assignmentLoading && <p role="status">{t('studySessions.loading')}</p>}
          {state.assignmentError && <p role="alert" className="text-danger-700 dark:text-danger-300">{t(state.assignmentError)}</p>}
          <div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="ghost" disabled={state.assignmentLoading || state.assignmentPage <= 1} onClick={() => findAssignments(state.assignmentPage - 1)}>{t('studySessions.previous')}</Button><Button type="button" variant="ghost" disabled={state.assignmentLoading || state.assignmentPage >= state.assignmentPages} onClick={() => findAssignments(state.assignmentPage + 1)}>{t('studySessions.next')}</Button></div>
        </fieldset>
        <p className="text-sm text-ink-muted">{t('studySessions.behavior')}</p>
        <Button type="submit" disabled={disabled || !startPayload(title, assignmentId)} loading={state.busy}>{t('studySessions.actions.start')}</Button>
      </form>}
    </Card>
    <section aria-labelledby="study-session-history" className="space-y-5">
      <h2 id="study-session-history" className="text-xl font-bold">{t('studySessions.history')}</h2>
      <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={event => { event.preventDefault(); store.loadReport(filters, 1); }}>
        <label className="block min-w-0 flex-1"><span className="mb-2 block text-sm font-semibold">{t('studySessions.from')}</span><input type="date" className="input min-w-0 w-full" required value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
        <label className="block min-w-0 flex-1"><span className="mb-2 block text-sm font-semibold">{t('studySessions.to')}</span><input type="date" className="input min-w-0 w-full" required value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold">{t('studySessions.historyStatus')}</span><select className="input" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>{['all', 'completed', 'discarded'].map(status => <option key={status} value={status}>{t(`studySessions.status.${status}`)}</option>)}</select></label>
        <Button type="submit" variant="outline" disabled={state.reportLoading || state.busy}>{t('studySessions.apply')}</Button>
      </form>
      <p className="text-sm text-ink-muted">{t('studySessions.window')}</p>
      {state.reportLoading && <p role="status">{t('studySessions.loading')}</p>}
      {state.reportError && <div role="alert"><p className="text-danger-700 dark:text-danger-300">{t(state.reportError)}</p><Button className="mt-2" variant="outline" onClick={() => store.loadReport()}>{t('studySessions.retry')}</Button></div>}
      {state.summary && <>
        <p className="text-sm text-ink-muted">{t('studySessions.reportScope', { from: state.filters.from, to: state.filters.to })}</p>
        <div className="grid gap-4 sm:grid-cols-3">{[
          ['completedCount', state.summary.completedSessionCount.toLocaleString(lang)],
          ['totalDuration', formatDuration(state.summary.totalCompletedSeconds)],
          ['averageDuration', formatDuration(state.summary.averageCompletedSeconds)],
        ].map(([label, value]) => <Card padding="lg" key={label}><h3 className="text-sm text-ink-muted">{t(`studySessions.${label}`)}</h3><p className="mt-2 break-words font-mono text-2xl font-bold">{value}</p></Card>)}</div>
        <DailyChart summary={state.summary} />
      </>}
      {!state.reportLoading && !state.reportError && (state.history.length ? <ul className="grid gap-4 lg:grid-cols-2">{state.history.map(session => <li key={session.id} className="rounded-xl border border-divider bg-surface p-5">
        <div className="flex flex-wrap justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{session.title}</h3><span className="text-sm">{t(`studySessions.status.${session.status}`)}</span></div>
        <dl className="mt-3 space-y-2 text-sm"><div><dt className="text-ink-muted">{t('studySessions.duration')}</dt><dd className="font-mono">{formatDuration(session.elapsedSeconds)}</dd></div><div><dt className="text-ink-muted">{t('studySessions.started')}</dt><dd>{formatInstant(session.started_at)}</dd></div><div><dt className="text-ink-muted">{t('studySessions.ended')}</dt><dd>{formatInstant(session.ended_at)}</dd></div></dl>
        {session.assignment_id !== null && <p className="mt-2 text-sm">{t('studySessions.linked', { id: session.assignment_id })}</p>}
        {session.limitReached && <p className="mt-2 text-sm">{t('studySessions.cappedHistory')}</p>}
      </li>)}</ul> : <p className="rounded-xl border border-divider p-5 text-ink-muted">{t('studySessions.empty')}</p>)}
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t('studySessions.pagination')}>
        <Button variant="ghost" disabled={state.reportLoading || state.busy || state.page <= 1} onClick={() => store.loadReport(state.filters, state.page - 1)}>{t('studySessions.previous')}</Button>
        <span className="text-sm text-ink-muted">{t('studySessions.page', { page: state.page, pages: Math.max(1, state.pagination.totalPages), count: state.pagination.total })}</span>
        <Button variant="ghost" disabled={state.reportLoading || state.busy || state.page >= state.pagination.totalPages} onClick={() => store.loadReport(state.filters, state.page + 1)}>{t('studySessions.next')}</Button>
      </nav>
    </section>
    <ConfirmDialog isOpen={Boolean(discard)} onClose={() => { if (!state.busy) setDiscard(null); }} title={t('studySessions.discardTitle')}
      message={discardCurrent ? t('studySessions.discardMessage') : t('studySessions.changed')}
      confirmText={t('studySessions.actions.discard')} loading={state.busy}
      onConfirm={async () => { if (discardCurrent && !disabled) await store.mutate('discard'); setDiscard(null); }} />
  </div>;
}
