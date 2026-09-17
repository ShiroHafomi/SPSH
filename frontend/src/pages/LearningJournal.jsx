import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { Button, Card, Modal, PageHeader } from '../components/ui';
import { createJournalStore, DEFAULT_FILTERS, isDirty, listState, TEXT_LIMITS } from '../utils/learningJournal';

export default function LearningJournal() {
  const { user } = useAuth();
  return <JournalContent key={`${user?.id}:${user?.role}:${user?.studentId}`} />;
}
function JournalContent() {
  const { t, lang } = useLanguage();
  const store = useMemo(() => createJournalStore(api), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const dirty = isDirty(state);
  useEffect(() => {
    store.resume(); store.load();
    const focus = () => { if (document.visibilityState === 'visible' && !store.getSnapshot().busy) store.load(); };
    window.addEventListener('focus', focus);
    return () => { window.removeEventListener('focus', focus); store.dispose(); };
  }, [store]);
  useEffect(() => {
    if (!dirty && !state.busy) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, state.busy]);
  const dateLabel = date => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const rating = value => value == null ? t('learningJournal.unrated') : t('learningJournal.ratingValue', { value });
  const editing = ['create', 'edit'].includes(state.mode);
  const changeFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const formId = 'learning-journal-form';
  const modeTitle = state.discardAction ? t('learningJournal.unsavedTitle') : t(`learningJournal.${state.mode || 'view'}`);
  const footer = state.discardAction ? <>
    <Button variant="ghost" onClick={store.keepEditing}>{t('learningJournal.keepEditing')}</Button>
    <Button variant="danger" onClick={store.discardEdits}>{t('learningJournal.discardEdits')}</Button>
  </> : state.mode === 'delete' ? <>
    <Button variant="ghost" disabled={state.busy} onClick={store.cancelDelete}>{t('learningJournal.cancel')}</Button>
    <Button variant="danger" loading={state.busy} disabled={state.conflicted} onClick={store.remove}>{t('learningJournal.confirmDelete')}</Button>
  </> : editing ? <>
    <Button variant="ghost" disabled={state.busy} onClick={store.close}>{t('learningJournal.cancel')}</Button>
    <Button type="submit" form={formId} loading={state.busy} disabled={state.conflicted}>{t('learningJournal.save')}</Button>
  </> : <>
    <Button variant="ghost" disabled={state.busy} onClick={store.close}>{t('learningJournal.close')}</Button>
    {state.entry && !state.detailLoading && <><Button variant="outline" disabled={state.busy} onClick={store.edit}>{t('learningJournal.edit')}</Button><Button variant="danger" disabled={state.busy} onClick={store.confirmDelete}>{t('learningJournal.delete')}</Button></>}
  </>;
  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader title={t('learningJournal.title')} subtitle={t('learningJournal.subtitle')} />
    <p className="text-sm text-ink-muted">{t('learningJournal.privacy')}</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button onClick={store.create} disabled={state.busy || Boolean(state.mode)}>{t('learningJournal.create')}</Button>
      <Button variant="outline" disabled={state.loading || state.busy} onClick={() => store.load()}>{t('learningJournal.refresh')}</Button>
    </div>
    <div role="status" aria-live="polite" className="text-sm text-ink-muted">{state.notice ? t(state.notice) : ''}</div>
    <Card padding="lg">
      <form className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => { event.preventDefault(); store.load(filters, 1); }}>
        <label className="block min-w-0 sm:col-span-2 lg:col-span-4"><span className="mb-2 block text-sm font-semibold">{t('learningJournal.search')}</span><input className="input w-full" maxLength={100} value={filters.q} onChange={event => changeFilter('q', event.target.value)} /></label>
        {['from', 'to'].map(key => <label key={key} className="block min-w-0"><span className="mb-2 block text-sm font-semibold">{t(`learningJournal.${key}`)}</span><input className="input min-w-0 w-full" type="date" value={filters[key]} onChange={event => changeFilter(key, event.target.value)} /></label>)}
        <label className="block min-w-0"><span className="mb-2 block text-sm font-semibold">{t('learningJournal.rating')}</span><select className="input w-full" value={filters.rating} onChange={event => changeFilter('rating', event.target.value)}><option value="">{t('learningJournal.allRatings')}</option>{[1, 2, 3, 4, 5].map(value => <option value={value} key={value}>{rating(value)}</option>)}</select></label>
        <Button type="submit" variant="outline" disabled={state.loading || state.busy}>{t('learningJournal.apply')}</Button>
      </form>
      <p className="mt-3 text-sm text-ink-muted">{t('learningJournal.filterHelp')}</p>
    </Card>
    {listState(state) === 'loading' && <p role="status">{t('learningJournal.loading')}</p>}
    {listState(state) === 'error' && <div role="alert" className="rounded-xl border border-danger-300 p-4"><p className="text-danger-700 dark:text-danger-300">{t(state.error)}</p><Button className="mt-3" variant="outline" onClick={() => store.load()}>{t('learningJournal.retry')}</Button></div>}
    {listState(state) === 'empty' && <Card padding="lg"><p className="text-ink-muted">{t('learningJournal.empty')}</p></Card>}
    {listState(state) === 'ready' && <ul className="grid gap-4 sm:grid-cols-2">{state.entries.map(entry => <li key={entry.id} className="min-w-0 rounded-xl border border-divider bg-surface p-5">
      <div className="flex flex-wrap justify-between gap-2 text-sm text-ink-muted"><time dateTime={entry.entry_date}>{dateLabel(entry.entry_date)}</time><span>{rating(entry.understanding_rating)}</span></div>
      <h2 className="mt-3 break-words font-semibold">{entry.title}</h2>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-muted">{entry.learned_preview}</p>
      <Button className="mt-4" variant="outline" disabled={state.busy} onClick={() => store.open(entry.id)} aria-label={t('learningJournal.openNamed', { title: entry.title })}>{t('learningJournal.open')}</Button>
    </li>)}</ul>}
    <nav aria-label={t('learningJournal.pagination')} className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" disabled={state.loading || state.busy || state.pagination.page <= 1} onClick={() => store.load(state.filters, state.pagination.page - 1)}>{t('learningJournal.previous')}</Button>
      <span className="text-sm text-ink-muted">{t('learningJournal.page', { page: state.pagination.page, pages: Math.max(1, state.pagination.totalPages), count: state.pagination.total })}</span>
      <Button variant="ghost" disabled={state.loading || state.busy || state.pagination.page >= state.pagination.totalPages} onClick={() => store.load(state.filters, state.pagination.page + 1)}>{t('learningJournal.next')}</Button>
    </nav>
    <Modal isOpen={Boolean(state.mode)} title={modeTitle} onClose={state.discardAction ? store.keepEditing : store.close} size={state.discardAction || state.mode === 'delete' ? 'sm' : 'lg'} footer={footer} closeOnEscape={!state.busy} closeOnOverlayClick={!state.busy} showCloseButton={!state.busy}>
      {state.discardAction ? <p>{t('learningJournal.unsavedMessage')}</p> : <div className="space-y-4">
        {state.formError && <div role="alert" className="space-y-3 text-danger-700 dark:text-danger-300"><p>{t(state.formError)}</p>{state.entryId && !state.busy && <Button variant="outline" onClick={store.reload}>{t('learningJournal.reload')}</Button>}</div>}
        {state.detailLoading && <p role="status">{t('learningJournal.loading')}</p>}
        {state.mode === 'delete' && <p>{t('learningJournal.deleteMessage', { title: state.entry?.title || '' })}</p>}
        {editing && <form id={formId} className="space-y-4" onSubmit={event => { event.preventDefault(); store.save(); }}>
          <p className="text-sm text-ink-muted">{t('learningJournal.formHelp')}</p>
          <fieldset disabled={state.busy} className="min-w-0 space-y-4">
            <label className="block"><span className="mb-2 block text-sm font-semibold">{t('learningJournal.entry_date')}</span><input id="journal-entry-date" className="input min-w-0 w-full" type="date" required max={state.today} value={state.draft.entry_date} onChange={event => store.change('entry_date', event.target.value)} aria-invalid={Boolean(state.errors.entry_date)} aria-describedby={state.errors.entry_date ? 'journal-entry-date-error' : undefined} />{state.errors.entry_date && <span id="journal-entry-date-error" className="mt-1 block text-sm text-danger-700 dark:text-danger-300">{t(state.errors.entry_date)}</span>}</label>
            {Object.entries(TEXT_LIMITS).map(([key, max]) => {
              const props = { id: `journal-${key}`, className: 'input w-full', value: state.draft[key], maxLength: max, required: ['title', 'learned_text'].includes(key), onChange: event => store.change(key, event.target.value), 'aria-invalid': Boolean(state.errors[key]), 'aria-describedby': `journal-${key}-help` };
              return <label className="block" key={key}><span className="mb-2 block text-sm font-semibold">{t(`learningJournal.${key === 'title' ? 'entryTitle' : key}`)}</span>{key === 'title' ? <input {...props} /> : <textarea {...props} rows={key === 'learned_text' ? 5 : 3} />}<span id={`journal-${key}-help`} className={`mt-1 block text-sm ${state.errors[key] ? 'text-danger-700 dark:text-danger-300' : 'text-ink-muted'}`}>{state.errors[key] ? t(state.errors[key]) : t('learningJournal.characterLimit', { count: state.draft[key].length, max })}</span></label>;
            })}
            <label className="block"><span className="mb-2 block text-sm font-semibold">{t('learningJournal.rating')}</span><select className="input w-full" value={state.draft.understanding_rating} onChange={event => store.change('understanding_rating', event.target.value)} aria-invalid={Boolean(state.errors.understanding_rating)}><option value="">{t('learningJournal.unrated')}</option>{[1, 2, 3, 4, 5].map(value => <option value={value} key={value}>{rating(value)}</option>)}</select></label>
          </fieldset>
          <p className="text-sm text-ink-muted">{t('learningJournal.ratingHelp')}</p>
        </form>}
        {state.mode === 'view' && state.entry && !state.detailLoading && <article className="space-y-5">
          <h3 className="break-words text-xl font-bold">{state.entry.title}</h3><p className="text-sm text-ink-muted">{dateLabel(state.entry.entry_date)} · {rating(state.entry.understanding_rating)}</p>
          {['learned_text', 'difficulties_text', 'next_steps_text'].map(key => <section key={key}><h4 className="font-semibold">{t(`learningJournal.${key}`)}</h4><p className="mt-2 whitespace-pre-wrap break-words">{state.entry[key] || t('learningJournal.notProvided')}</p></section>)}
          <p className="text-sm text-ink-muted">{t('learningJournal.ratingHelp')}</p>
        </article>}
      </div>}
    </Modal>
  </div>;
}
