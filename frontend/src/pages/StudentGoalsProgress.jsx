import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { Button, ErrorState, PageHeader, SkeletonCard } from '../components/ui';
import CheckinHistory from '../components/goals/CheckinHistory';
import GoalEmptyState from '../components/goals/GoalEmptyState';
import GoalSummaryCard from '../components/goals/GoalSummaryCard';
import ProgressCharts from '../components/goals/ProgressCharts';
import ProgressOverview from '../components/goals/ProgressOverview';
import TeacherFeedbackForm from '../components/goals/TeacherFeedbackForm';
import { asPositiveSafeInteger, normalizeGoalEntries, normalizeGoalPagination } from '../utils/goalProgress';

const PAGE_SIZE = 20;

export default function StudentGoalsProgress({ mode }) {
  const { studentId } = useParams();
  const safeStudentId = asPositiveSafeInteger(studentId);
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const requestRef = useRef(0);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, size: PAGE_SIZE, total: 0, totalPages: 1 });

  const endpoint = mode === 'admin' ? '/admin' : '/teacher';
  const backTo = mode === 'admin' ? '/admin/students' : '/teacher';

  const loadGoals = useCallback(async (page = 1) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');

    if (safeStudentId === null) {
      setError(t('common.notFound'));
      setLoading(false);
      return;
    }

    const requestedPage = asPositiveSafeInteger(page) || 1;
    const requestPage = (targetPage) => {
      const query = mode === 'admin' ? `?page=${targetPage}&size=${PAGE_SIZE}` : '';
      return api.get(`${endpoint}/students/${safeStudentId}/goals${query}`);
    };

    try {
      let response = await requestPage(requestedPage);
      if (requestId !== requestRef.current) return;

      let normalizedPagination = mode === 'admin'
        ? normalizeGoalPagination(response, requestedPage, PAGE_SIZE)
        : null;
      if (normalizedPagination && normalizedPagination.page !== requestedPage) {
        response = await requestPage(normalizedPagination.page);
        if (requestId !== requestRef.current) return;
        normalizedPagination = normalizeGoalPagination(response, normalizedPagination.page, PAGE_SIZE);
      }

      const entries = normalizeGoalEntries(response?.goals);
      setGoals(entries);
      setSelectedGoalId((current) => (
        entries.some((entry) => entry.goal.id === current)
          ? current
          : entries[0]?.goal.id ?? null
      ));
      if (normalizedPagination) setPagination(normalizedPagination);
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError(loadError?.message || t('goals.loadFailed'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [endpoint, mode, safeStudentId, t]);

  useEffect(() => {
    loadGoals();
    return () => {
      requestRef.current += 1;
    };
  }, [loadGoals]);

  const selectedEntry = useMemo(
    () => goals.find((entry) => entry.goal?.id === selectedGoalId) || null,
    [goals, selectedGoalId]
  );

  const saveFeedback = async (goalId, checkInId, teacherFeedback) => {
    const safeGoalId = asPositiveSafeInteger(goalId);
    const safeCheckInId = asPositiveSafeInteger(checkInId);
    if (safeStudentId === null || safeGoalId === null || safeCheckInId === null) {
      throw new Error(t('checkins.feedbackFailed'));
    }

    const response = await api.put(`/teacher/students/${safeStudentId}/goals/${safeGoalId}/feedback`, {
      checkin_id: safeCheckInId,
      teacher_feedback: teacherFeedback,
    });
    addFlash(t('checkins.feedbackSaved'), 'success');
    if (response?.changed) await loadGoals();
  };

  if (loading) {
    return <div className="space-y-5" aria-busy="true" aria-label={t('common.loading')}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }

  if (error) {
    return (
      <ErrorState
        title={t('common.failedToLoad')}
        description={error}
        action={() => loadGoals(pagination.page)}
        actionLabel={t('goals.retryLoad')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <Link className="focus-ring inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-action transition-colors hover:bg-action-muted" to={backTo}>
          {t('common.backToList')}
        </Link>
        <PageHeader
          className="mt-2"
          title={t('goals.studentProgress', { name: safeStudentId ?? '—' })}
          subtitle={t('goals.studentProgressDesc')}
        />
      </div>

      {!goals.length ? <GoalEmptyState description={t('goals.noStudentGoalsDesc')} /> : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {goals.map((entry) => (
              <GoalSummaryCard key={entry.goal.id} entry={entry} onSelect={(selected) => setSelectedGoalId(selected.goal.id)} />
            ))}
          </div>

          {selectedEntry && (
            <section className="space-y-6" aria-label={t('goals.viewProgress')}>
              <ProgressOverview goal={selectedEntry.goal} progress={selectedEntry.progress} />
              <ProgressCharts checkIns={selectedEntry.checkIns} progress={selectedEntry.progress} />
              <CheckinHistory
                checkIns={selectedEntry.checkIns}
                renderFeedback={mode === 'teacher'
                  ? (checkIn) => <TeacherFeedbackForm key={`feedback-${checkIn.id}`} checkIn={checkIn} onSave={(checkInId, feedback) => saveFeedback(selectedEntry.goal.id, checkInId, feedback)} />
                  : undefined}
              />
            </section>
          )}

          {mode === 'admin' && pagination.totalPages > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5" aria-label={t('table.pagination')}>
              <p className="text-sm text-ink-muted">{t('common.showing', { start: (pagination.page - 1) * pagination.size + 1, end: Math.min(pagination.page * pagination.size, pagination.total), total: pagination.total })}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadGoals(pagination.page - 1)}>{t('common.previous')}</Button>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => loadGoals(pagination.page + 1)}>{t('common.next')}</Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
