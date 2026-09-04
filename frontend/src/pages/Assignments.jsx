import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  SkeletonCard,
  Textarea,
  useFlash,
} from '../components/ui';
import {
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_STATUSES,
  DEFAULT_ASSIGNMENT_FILTERS,
  applyAssignmentFilterChange,
  assignmentToDraft,
  buildAssignmentDateRange,
  buildAssignmentDeletePath,
  buildAssignmentPayload,
  buildAssignmentQuery,
  computeAssignmentTimeState,
  createLatestAssignmentRequestTracker,
  formatAssignmentDeadline,
  getAssignmentFormStatuses,
  getAssignmentListState,
  getAssignmentStatusTransition,
  getAssignmentTimeZoneOptions,
  getDeadlineRelativeState,
  normalizeAssignmentListResponse,
  preserveAssignmentDraftAfterConflict,
  preserveAssignmentDraftAfterFailure,
  refreshAssignmentTimeStates,
  validateAssignmentDraft,
  validateAssignmentFilterRange,
} from '../utils/assignments';

const EMPTY_SUMMARY = { todo: 0, inProgress: 0, done: 0, overdue: 0 };
const DEFAULT_PAGE_SIZE = 20;

function localDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function newDraft(timezone) {
  return {
    title: '',
    subject: '',
    description: '',
    dueDate: localDateString(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    dueTime: '18:00',
    timezone,
    priority: 'medium',
    status: 'todo',
    version: 1,
  };
}

function AssignmentSummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    default: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
    info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
    success: 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-200',
    danger: 'bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-200',
  };
  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800" padding="sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary-950 dark:text-gray-100">{value}</p>
        </div>
        <span className={`flex size-11 items-center justify-center rounded-2xl ${tones[tone] || tones.default}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

export default function Assignments() {
  const { t, lang } = useLanguage();
  const { addFlash } = useFlash();
  const viewingTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );
  const [filters, setFilters] = useState({ ...DEFAULT_ASSIGNMENT_FILTERS });
  const [filterError, setFilterError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [assignments, setAssignments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, size, total: 0, totalPages: 0 });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formState, setFormState] = useState({
    open: false,
    mode: 'create',
    assignment: null,
    draft: newDraft(viewingTimezone),
    errors: {},
    submitting: false,
    submitError: '',
    conflicted: false,
  });
  const [confirmation, setConfirmation] = useState({
    open: false,
    type: '',
    assignment: null,
    loading: false,
  });
  const [mutatingId, setMutatingId] = useState(null);
  const requestTracker = useRef(createLatestAssignmentRequestTracker());
  const latestLoadAssignments = useRef(null);
  const foregroundRequestActive = useRef(false);
  const lastAutomaticRefreshAt = useRef(0);

  const timezoneOptions = useMemo(
    () => getAssignmentTimeZoneOptions([
      viewingTimezone,
      formState.draft.timezone,
    ]).map((zone) => ({ value: zone, label: zone })),
    [formState.draft.timezone, viewingTimezone]
  );

  const hasFilters = useMemo(() => Object.entries(filters).some(([key, value]) => {
    if (key === 'sort') return value !== DEFAULT_ASSIGNMENT_FILTERS.sort;
    return value !== '';
  }), [filters]);

  const requestErrorMessage = useCallback((error, fallbackKey) => {
    if (error?.status === 409) return t('assignments.conflictDetected');
    if (error?.status === 429) return t('assignments.rateLimited');
    if (error?.status === 404) return t('assignments.notFound');
    if (error?.status === 400) return t('assignments.invalidRequest');
    return t(fallbackKey);
  }, [t]);

  const loadAssignments = useCallback(async ({ silent = false } = {}) => {
    if (silent && foregroundRequestActive.current) return false;
    const requestId = requestTracker.current.begin();
    if (!silent) {
      foregroundRequestActive.current = true;
      setLoading(true);
      setLoadError('');
    }
    try {
      const apiFilters = buildAssignmentDateRange(filters, viewingTimezone);
      if (!apiFilters) {
        if (requestTracker.current.isCurrent(requestId)) setFilterError('invalidDateRange');
        return false;
      }
      const response = await api.get(
        `/student/me/assignments${buildAssignmentQuery(apiFilters, { page, size })}`
      );
      if (!requestTracker.current.isCurrent(requestId)) return false;
      const normalized = normalizeAssignmentListResponse(response, page, size);
      setAssignments(refreshAssignmentTimeStates(normalized.assignments, normalized.asOf));
      setPagination(normalized.pagination);
      setSummary(normalized.summary);
      setAsOf(normalized.asOf);
      if (normalized.pagination.page !== page && normalized.pagination.totalPages > 0) {
        setPage(normalized.pagination.page);
      }
      return true;
    } catch (error) {
      if (!requestTracker.current.isCurrent(requestId)) return false;
      if (!silent) setLoadError(requestErrorMessage(error, 'assignments.loadFailed'));
      return false;
    } finally {
      if (requestTracker.current.isCurrent(requestId)) {
        if (!silent) foregroundRequestActive.current = false;
        setLoading(false);
      }
    }
  }, [filters, page, requestErrorMessage, size, viewingTimezone]);
  latestLoadAssignments.current = loadAssignments;
  const reloadCurrentAssignments = useCallback(
    (options) => latestLoadAssignments.current?.(options) ?? Promise.resolve(false),
    []
  );

  useEffect(() => {
    loadAssignments();
    return () => requestTracker.current.invalidate();
  }, [loadAssignments]);

  useEffect(() => {
    const refreshAfterVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastAutomaticRefreshAt.current < 1_000) return;
      lastAutomaticRefreshAt.current = now;
      loadAssignments({ silent: true });
    };
    const interval = window.setInterval(refreshAfterVisibility, 60_000);
    window.addEventListener('focus', refreshAfterVisibility);
    document.addEventListener('visibilitychange', refreshAfterVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshAfterVisibility);
      document.removeEventListener('visibilitychange', refreshAfterVisibility);
    };
  }, [loadAssignments]);

  const changeFilters = useCallback((changes) => {
    const next = applyAssignmentFilterChange(filters, changes);
    const dateError = validateAssignmentFilterRange(next.filters, viewingTimezone);
    if (dateError) {
      setFilterError(dateError);
      return;
    }
    setFilterError('');
    setFilters(next.filters);
    setPage(next.page);
  }, [filters, viewingTimezone]);

  const clearFilters = useCallback(() => {
    setFilters({ ...DEFAULT_ASSIGNMENT_FILTERS });
    setFilterError('');
    setSearchDraft('');
    setPage(1);
  }, []);

  const openCreateForm = useCallback(() => {
    setFormState({
      open: true,
      mode: 'create',
      assignment: null,
      draft: newDraft(viewingTimezone),
      errors: {},
      submitting: false,
      submitError: '',
      conflicted: false,
    });
  }, [viewingTimezone]);

  const openEditForm = useCallback((assignment) => {
    setFormState({
      open: true,
      mode: 'edit',
      assignment,
      draft: assignmentToDraft(assignment, viewingTimezone),
      errors: {},
      submitting: false,
      submitError: '',
      conflicted: false,
    });
  }, [viewingTimezone]);

  const closeForm = useCallback(() => {
    if (formState.submitting) return;
    setFormState((current) => ({ ...current, open: false, submitError: '' }));
  }, [formState.submitting]);

  const updateDraft = useCallback((field, value) => {
    setFormState((current) => current.submitting ? current : ({
      ...current,
      draft: { ...current.draft, [field]: value },
      errors: { ...current.errors, [field]: undefined },
      submitError: current.conflicted ? current.submitError : '',
    }));
  }, []);

  const translatedError = useCallback((code) => code ? t(`assignments.validation.${code}`) : '', [t]);

  const submitAssignment = useCallback(async (event) => {
    event.preventDefault();
    if (formState.submitting || formState.conflicted) return;
    const errors = validateAssignmentDraft(formState.draft);
    if (Object.keys(errors).length > 0) {
      setFormState((current) => ({ ...current, errors }));
      return;
    }

    const includeVersion = formState.mode === 'edit';
    const payload = buildAssignmentPayload(formState.draft, { includeVersion });
    if (!payload) {
      setFormState((current) => ({ ...current, errors: { dueDate: 'invalidDeadline' } }));
      return;
    }
    if (formState.assignment?.status === 'done') {
      delete payload.due_at;
      delete payload.timezone;
      payload.status = 'done';
    }

    setFormState((current) => ({ ...current, submitting: true, submitError: '' }));
    try {
      if (formState.mode === 'create') {
        await api.post('/student/me/assignments', payload);
        addFlash(t('assignments.created'), 'success');
      } else {
        await api.patch(`/student/me/assignments/${formState.assignment.id}`, payload);
        addFlash(t('assignments.updated'), 'success');
      }
      setFormState((current) => ({ ...current, open: false, submitting: false }));
      await reloadCurrentAssignments();
    } catch (error) {
      if (error?.status === 409) {
        const reloaded = await reloadCurrentAssignments({ silent: true });
        const message = t(reloaded ? 'assignments.conflictReloaded' : 'assignments.conflictReloadFailed');
        setFormState((current) => preserveAssignmentDraftAfterConflict(current, message));
        addFlash(message, 'error');
        return;
      }
      setFormState((current) => preserveAssignmentDraftAfterFailure(
        current,
        requestErrorMessage(error, 'assignments.saveFailed')
      ));
    }
  }, [addFlash, formState, reloadCurrentAssignments, requestErrorMessage, t]);

  const requestConfirmation = useCallback((type, assignment) => {
    setConfirmation({ open: true, type, assignment, loading: false });
  }, []);

  const closeConfirmation = useCallback(() => {
    if (confirmation.loading) return;
    setConfirmation((current) => ({ ...current, open: false }));
  }, [confirmation.loading]);

  const applyStatus = useCallback(async (assignment, status) => {
    setMutatingId(assignment.id);
    try {
      await api.patch(`/student/me/assignments/${assignment.id}`, {
        status,
        version: assignment.version,
      });
      addFlash(
        t(status === 'done' ? 'assignments.completed' : status === 'todo' ? 'assignments.reopened' : 'assignments.statusUpdated'),
        'success'
      );
      await reloadCurrentAssignments();
    } catch (error) {
      if (error?.status === 409) {
        const reloaded = await reloadCurrentAssignments({ silent: true });
        addFlash(t(reloaded ? 'assignments.conflictReloaded' : 'assignments.conflictReloadFailed'), 'error');
      } else {
        addFlash(requestErrorMessage(error, 'assignments.actionFailed'), 'error');
      }
    } finally {
      setMutatingId(null);
    }
  }, [addFlash, reloadCurrentAssignments, requestErrorMessage, t]);

  const requestStatusChange = useCallback((assignment, status) => {
    const transition = getAssignmentStatusTransition(assignment, status);
    if (!transition.allowed) return;
    if (transition.requiresConfirmation) {
      requestConfirmation(transition.confirmation, assignment);
      return;
    }
    applyStatus(assignment, status);
  }, [applyStatus, requestConfirmation]);

  const confirmAction = useCallback(async () => {
    const assignment = confirmation.assignment;
    if (!assignment) return;
    setConfirmation((current) => ({ ...current, loading: true }));
    try {
      if (confirmation.type === 'delete') {
        const deletePath = buildAssignmentDeletePath(assignment);
        if (!deletePath) throw new Error('Invalid assignment delete target.');
        await api.delete(deletePath);
        addFlash(t('assignments.deleted'), 'success');
        setConfirmation((current) => ({ ...current, open: false, loading: false }));
        if (assignments.length === 1 && page > 1) setPage((current) => current - 1);
        else await reloadCurrentAssignments();
        return;
      }
      await applyStatus(assignment, confirmation.type === 'complete' ? 'done' : 'todo');
      setConfirmation((current) => ({ ...current, open: false, loading: false }));
    } catch (error) {
      if (error?.status === 409) {
        const reloaded = await reloadCurrentAssignments({ silent: true });
        addFlash(t(reloaded ? 'assignments.conflictReloaded' : 'assignments.conflictReloadFailed'), 'error');
        setConfirmation((current) => ({ ...current, open: false, loading: false }));
        return;
      }
      addFlash(requestErrorMessage(error, 'assignments.actionFailed'), 'error');
      setConfirmation((current) => ({ ...current, loading: false }));
    }
  }, [addFlash, applyStatus, assignments.length, confirmation, page, reloadCurrentAssignments, requestErrorMessage, t]);

  const listState = getAssignmentListState({ loading, error: loadError, assignments, hasFilters });
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const statusOptions = [
    { value: '', label: t('assignments.filters.allStatuses') },
    ...ASSIGNMENT_STATUSES.map((status) => ({ value: status, label: t(`assignments.status.${status}`) })),
  ];
  const priorityOptions = [
    { value: '', label: t('assignments.filters.allPriorities') },
    ...ASSIGNMENT_PRIORITIES.map((priority) => ({ value: priority, label: t(`assignments.priority.${priority}`) })),
  ];
  const formStatusOptions = getAssignmentFormStatuses(
    formState.mode,
    formState.assignment?.status
  ).map((status) => ({
    value: status,
    label: t(`assignments.status.${status}`),
  }));
  const formPriorityOptions = ASSIGNMENT_PRIORITIES.map((priority) => ({
    value: priority,
    label: t(`assignments.priority.${priority}`),
  }));

  const confirmationCopy = confirmation.type ? {
    delete: {
      title: t('assignments.confirm.deleteTitle'),
      message: t('assignments.confirm.deleteMessage', { title: confirmation.assignment?.title || '' }),
      confirmText: t('assignments.actions.delete'),
      variant: 'danger',
    },
    complete: {
      title: t('assignments.confirm.completeTitle'),
      message: t('assignments.confirm.completeMessage', { title: confirmation.assignment?.title || '' }),
      confirmText: t('assignments.actions.complete'),
      variant: 'success',
    },
    reopen: {
      title: t('assignments.confirm.reopenTitle'),
      message: t('assignments.confirm.reopenMessage', { title: confirmation.assignment?.title || '' }),
      confirmText: t('assignments.actions.reopen'),
      variant: 'warning',
    },
  }[confirmation.type] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-950 dark:text-gray-100">{t('assignments.title')}</h1>
          <p className="mt-1 max-w-3xl text-primary-600 dark:text-gray-400">{t('assignments.subtitle')}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-primary-500 dark:text-gray-400">
            <CalendarClock className="size-4" aria-hidden="true" />
            {t('assignments.viewingTimezone', { timezone: viewingTimezone })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => loadAssignments()}
            disabled={loading}
            leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
          >
            {t('assignments.actions.refresh')}
          </Button>
          <Button
            onClick={openCreateForm}
            leftIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            {t('assignments.actions.create')}
          </Button>
        </div>
      </header>

      <section aria-labelledby="assignment-summary-heading">
        <div className="mb-3 flex flex-col gap-1">
          <h2 id="assignment-summary-heading" className="text-lg font-bold text-primary-950 dark:text-gray-100">
            {t('assignments.summary.title')}
          </h2>
          <p className="text-sm text-primary-500 dark:text-gray-400">{t('assignments.summary.overdueNote')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AssignmentSummaryCard icon={CircleDashed} label={t('assignments.summary.todo')} value={summary.todo} tone="default" />
          <AssignmentSummaryCard icon={Clock3} label={t('assignments.summary.inProgress')} value={summary.inProgress} tone="info" />
          <AssignmentSummaryCard icon={CheckCircle2} label={t('assignments.summary.done')} value={summary.done} tone="success" />
          <AssignmentSummaryCard icon={AlertTriangle} label={t('assignments.summary.overdue')} value={summary.overdue} tone="danger" />
        </div>
      </section>

      <Card className="dark:bg-gray-900 dark:border-gray-800" padding="sm">
        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            changeFilters({ q: searchDraft.trim() });
          }}
        >
          <Input
            label={t('assignments.filters.search')}
            value={searchDraft}
            maxLength={100}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t('assignments.filters.searchPlaceholder')}
            leftIcon={<Search className="size-4" aria-hidden="true" />}
          />
          <Input
            label={t('assignments.fields.subject')}
            value={filters.subject}
            maxLength={80}
            onChange={(event) => changeFilters({ subject: event.target.value })}
            placeholder={t('assignments.filters.subjectPlaceholder')}
          />
          <Select
            label={t('assignments.fields.status')}
            value={filters.status}
            onChange={(event) => changeFilters({ status: event.target.value })}
            options={statusOptions}
          />
          <Select
            label={t('assignments.fields.priority')}
            value={filters.priority}
            onChange={(event) => changeFilters({ priority: event.target.value })}
            options={priorityOptions}
          />
          <Select
            label={t('assignments.filters.deadlineState')}
            value={filters.overdue}
            onChange={(event) => changeFilters({ overdue: event.target.value })}
            options={[
              { value: '', label: t('assignments.filters.allDeadlines') },
              { value: 'true', label: t('assignments.filters.overdueOnly') },
              { value: 'false', label: t('assignments.filters.notOverdue') },
            ]}
          />
          <Input
            type="date"
            label={t('assignments.filters.from')}
            value={filters.from}
            onChange={(event) => changeFilters({ from: event.target.value })}
          />
          <Input
            type="date"
            label={t('assignments.filters.to')}
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => changeFilters({ to: event.target.value })}
            error={filterError ? t(`assignments.validation.${filterError}`) : undefined}
          />
          <Select
            label={t('assignments.filters.sort')}
            value={filters.sort}
            onChange={(event) => changeFilters({ sort: event.target.value })}
            options={[
              { value: 'due_asc', label: t('assignments.sort.dueAsc') },
              { value: 'due_desc', label: t('assignments.sort.dueDesc') },
              { value: 'created_desc', label: t('assignments.sort.createdDesc') },
              { value: 'priority_desc', label: t('assignments.sort.priorityDesc') },
              { value: 'title_asc', label: t('assignments.sort.titleAsc') },
            ]}
          />
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
            <Button type="submit" variant="secondary" leftIcon={<Search className="size-4" aria-hidden="true" />}>
              {t('assignments.actions.search')}
            </Button>
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters && !searchDraft}>
              {t('assignments.actions.clearFilters')}
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="assignment-list-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="assignment-list-heading" className="text-lg font-bold text-primary-950 dark:text-gray-100">
              {t('assignments.listTitle')}
            </h2>
            <p className="text-sm text-primary-500 dark:text-gray-400" role="status" aria-live="polite" aria-atomic="true">
              {t(pagination.total === 1 ? 'assignments.showingOne' : 'assignments.showingCount', { count: pagination.total })}
            </p>
          </div>
          <p className="text-xs text-primary-500 dark:text-gray-400">
            {t('assignments.asOf', { time: formatAssignmentDeadline(asOf, viewingTimezone, locale) })}
          </p>
        </div>

        {listState === 'loading' && (
          <div className="grid gap-4" aria-label={t('assignments.states.loading')}>
            {[0, 1, 2].map((item) => <SkeletonCard key={item} />)}
          </div>
        )}

        {listState === 'error' && (
          <Card className="text-center dark:bg-gray-900 dark:border-gray-800">
            <AlertTriangle className="mx-auto size-10 text-danger-600 dark:text-danger-400" aria-hidden="true" />
            <h3 className="mt-3 font-bold text-primary-950 dark:text-gray-100">{t('assignments.states.errorTitle')}</h3>
            <p className="mt-1 text-sm text-danger-700 dark:text-danger-300">{loadError}</p>
            <Button className="mt-4" variant="outline" onClick={() => loadAssignments()}>{t('assignments.actions.retry')}</Button>
          </Card>
        )}

        {(listState === 'empty' || listState === 'noResults') && (
          <Card className="text-center dark:bg-gray-900 dark:border-gray-800">
            <BookOpen className="mx-auto size-10 text-primary-400 dark:text-gray-500" aria-hidden="true" />
            <h3 className="mt-3 font-bold text-primary-950 dark:text-gray-100">
              {t(listState === 'empty' ? 'assignments.states.emptyTitle' : 'assignments.states.noResultsTitle')}
            </h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-primary-500 dark:text-gray-400">
              {t(listState === 'empty' ? 'assignments.states.emptyDescription' : 'assignments.states.noResultsDescription')}
            </p>
            <Button className="mt-4" variant="outline" onClick={listState === 'empty' ? openCreateForm : clearFilters}>
              {t(listState === 'empty' ? 'assignments.actions.createFirst' : 'assignments.actions.clearFilters')}
            </Button>
          </Card>
        )}

        {listState === 'ready' && (
          <div className="space-y-4">
            {assignments.map((assignment) => {
              const timeState = computeAssignmentTimeState(assignment, asOf);
              const relative = getDeadlineRelativeState(assignment.due_at, asOf);
              const relativeKey = relative.count === 1
                ? `${relative.key}One`
                : relative.key;
              const priorityVariant = { low: 'gray', medium: 'warning', high: 'danger' }[assignment.priority];
              const statusVariant = { todo: 'default', in_progress: 'info', done: 'success' }[assignment.status];
              const isMutating = mutatingId === assignment.id;
              return (
                <article
                  key={assignment.id}
                  className={`rounded-3xl border bg-white p-5 shadow-bento dark:bg-gray-900 ${
                    timeState.isOverdue
                      ? 'border-danger-300 dark:border-danger-800'
                      : 'border-primary-100 dark:border-gray-800'
                  }`}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant} dot>{t(`assignments.status.${assignment.status}`)}</Badge>
                        <Badge variant={priorityVariant}>{t(`assignments.priority.${assignment.priority}`)}</Badge>
                        {timeState.isOverdue && (
                          <Badge variant="danger">
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                            {t('assignments.indicators.overdue')}
                          </Badge>
                        )}
                        {timeState.completedLate && (
                          <Badge variant="warning">
                            <Clock3 className="size-3.5" aria-hidden="true" />
                            {t('assignments.indicators.completedLate')}
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-3 break-words text-xl font-bold text-primary-950 dark:text-gray-100">{assignment.title}</h3>
                      {assignment.subject && (
                        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-gray-300">
                          <BookOpen className="size-4" aria-hidden="true" />
                          <span className="break-words">{assignment.subject}</span>
                        </p>
                      )}
                      {assignment.description && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-primary-600 dark:text-gray-400">
                          {assignment.description}
                        </p>
                      )}
                      <div className="mt-4 rounded-2xl bg-primary-50 p-3 dark:bg-gray-800/70">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary-800 dark:text-gray-200">
                          <CalendarClock className="size-4" aria-hidden="true" />
                          {formatAssignmentDeadline(assignment.due_at, assignment.timezone, locale)}
                        </p>
                        <p className={`mt-1 text-sm ${timeState.isOverdue ? 'font-semibold text-danger-700 dark:text-danger-300' : 'text-primary-500 dark:text-gray-400'}`}>
                          {t(`assignments.relative.${relativeKey}`, { count: relative.count })}
                        </p>
                        <p className="mt-1 text-xs text-primary-500 dark:text-gray-400">
                          {t('assignments.deadlineTimezone', { timezone: assignment.timezone })}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:max-w-sm lg:justify-end">
                      {assignment.status === 'todo' && (
                        <Button size="sm" variant="outline" disabled={isMutating} onClick={() => requestStatusChange(assignment, 'in_progress')}>
                          {t('assignments.actions.start')}
                        </Button>
                      )}
                      {assignment.status !== 'done' && (
                        <Button size="sm" variant="success" disabled={isMutating} onClick={() => requestStatusChange(assignment, 'done')}>
                          {t('assignments.actions.complete')}
                        </Button>
                      )}
                      {assignment.status === 'done' && (
                        <Button size="sm" variant="outline" disabled={isMutating} onClick={() => requestStatusChange(assignment, 'todo')}>
                          {t('assignments.actions.reopen')}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isMutating}
                        onClick={() => openEditForm(assignment)}
                        aria-label={t('assignments.actions.editNamed', { title: assignment.title })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isMutating}
                        onClick={() => requestConfirmation('delete', assignment)}
                        aria-label={t('assignments.actions.deleteNamed', { title: assignment.title })}
                        className="text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-950/30"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {listState === 'ready' && pagination.totalPages > 1 && (
        <nav className="flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label={t('assignments.pagination.label')}>
          <p className="text-sm text-primary-500 dark:text-gray-400">
            {t('assignments.pagination.page', { page: pagination.page, totalPages: pagination.totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <Select
              aria-label={t('assignments.pagination.pageSize')}
              value={String(size)}
              onChange={(event) => {
                setSize(Number(event.target.value));
                setPage(1);
              }}
              options={[10, 20, 50, 100].map((value) => ({ value: String(value), label: t('assignments.pagination.perPage', { count: value }) }))}
            />
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              {t('assignments.pagination.previous')}
            </Button>
            <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
              {t('assignments.pagination.next')}
            </Button>
          </div>
        </nav>
      )}

      <Modal
        isOpen={formState.open}
        onClose={closeForm}
        title={t(formState.mode === 'create' ? 'assignments.form.createTitle' : 'assignments.form.editTitle')}
        description={t('assignments.form.description')}
        closeLabel={t('assignments.actions.closeModal')}
        size="lg"
        closeOnOverlayClick={!formState.submitting}
        closeOnEscape={!formState.submitting}
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={closeForm} disabled={formState.submitting}>{t('assignments.actions.cancel')}</Button>
            <Button
              type="submit"
              form="assignment-form"
              loading={formState.submitting}
              disabled={formState.conflicted}
            >
              {t(formState.mode === 'create' ? 'assignments.actions.create' : 'assignments.actions.save')}
            </Button>
          </div>
        )}
      >
        <form id="assignment-form" className="space-y-4" onSubmit={submitAssignment} noValidate>
          {formState.submitError && (
            <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700 dark:bg-danger-950/30 dark:text-danger-300" role="alert">
              {formState.submitError}
            </p>
          )}
          <Input
            label={t('assignments.fields.title')}
            value={formState.draft.title}
            onChange={(event) => updateDraft('title', event.target.value)}
            maxLength={160}
            disabled={formState.submitting}
            required
            error={translatedError(formState.errors.title)}
            placeholder={t('assignments.form.titlePlaceholder')}
          />
          <Input
            label={t('assignments.fields.subject')}
            value={formState.draft.subject}
            onChange={(event) => updateDraft('subject', event.target.value)}
            maxLength={80}
            disabled={formState.submitting}
            error={translatedError(formState.errors.subject)}
            placeholder={t('assignments.form.subjectPlaceholder')}
          />
          <Textarea
            label={t('assignments.fields.description')}
            value={formState.draft.description}
            onChange={(event) => updateDraft('description', event.target.value)}
            maxLength={2000}
            rows={5}
            disabled={formState.submitting}
            error={translatedError(formState.errors.description)}
            hint={t('assignments.form.descriptionHint', { count: formState.draft.description.length })}
          />
          {formState.assignment?.status === 'done' && (
            <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-800 dark:bg-warning-950/30 dark:text-warning-200">
              {t('assignments.form.reopenDeadlineHelp')}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="date"
              label={t('assignments.fields.dueDate')}
              value={formState.draft.dueDate}
              onChange={(event) => updateDraft('dueDate', event.target.value)}
              disabled={formState.submitting || formState.assignment?.status === 'done'}
              required
              error={translatedError(formState.errors.dueDate)}
            />
            <Input
              type="time"
              label={t('assignments.fields.dueTime')}
              value={formState.draft.dueTime}
              onChange={(event) => updateDraft('dueTime', event.target.value)}
              disabled={formState.submitting || formState.assignment?.status === 'done'}
              required
              error={translatedError(formState.errors.dueTime)}
            />
          </div>
          <Select
            label={t('assignments.fields.timezone')}
            value={formState.draft.timezone}
            onChange={(event) => updateDraft('timezone', event.target.value)}
            disabled={formState.submitting || formState.assignment?.status === 'done'}
            required
            options={timezoneOptions}
            error={translatedError(formState.errors.timezone)}
            hint={t('assignments.form.timezoneHint')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t('assignments.fields.priority')}
              value={formState.draft.priority}
              onChange={(event) => updateDraft('priority', event.target.value)}
              disabled={formState.submitting}
              required
              options={formPriorityOptions}
              error={translatedError(formState.errors.priority)}
            />
            <Select
              label={t('assignments.fields.status')}
              value={formState.draft.status}
              onChange={(event) => updateDraft('status', event.target.value)}
              disabled={formState.submitting || formState.assignment?.status === 'done'}
              required
              options={formStatusOptions}
              error={translatedError(formState.errors.status)}
            />
          </div>
        </form>
      </Modal>

      {confirmationCopy && (
        <ConfirmDialog
          isOpen={confirmation.open}
          onClose={closeConfirmation}
          onConfirm={confirmAction}
          title={confirmationCopy.title}
          message={confirmationCopy.message}
          confirmText={confirmationCopy.confirmText}
          cancelText={t('assignments.actions.cancel')}
          closeLabel={t('assignments.actions.closeModal')}
          variant={confirmationCopy.variant}
          loading={confirmation.loading}
        />
      )}
    </div>
  );
}
