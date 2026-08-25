import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { Button, SkeletonCard } from '../components/ui';
import CheckinHistory from '../components/goals/CheckinHistory';
import GoalEmptyState from '../components/goals/GoalEmptyState';
import GoalSummaryCard from '../components/goals/GoalSummaryCard';
import ProgressCharts from '../components/goals/ProgressCharts';
import ProgressOverview from '../components/goals/ProgressOverview';
import TeacherFeedbackForm from '../components/goals/TeacherFeedbackForm';

export default function StudentGoalsProgress({ mode }) {
  const { studentId } = useParams();
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, size: 20, total: 0, totalPages: 1 });

  const endpoint = mode === 'admin' ? '/admin' : '/teacher';
  const backTo = mode === 'admin' ? '/admin/students' : '/teacher';

  const loadGoals = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const query = mode === 'admin' ? `?page=${page}&size=${pagination.size}` : '';
      const response = await api.get(`${endpoint}/students/${studentId}/goals${query}`);
      const entries = Array.isArray(response.goals) ? response.goals : [];
      setGoals(entries);
      setSelectedGoalId((current) => (
        entries.some((entry) => entry.goal?.id === current)
          ? current
          : entries[0]?.goal?.id ?? null
      ));
      if (mode === 'admin') {
        setPagination({
          page: response.page || page,
          size: response.size || pagination.size,
          total: response.total || 0,
          totalPages: response.totalPages || 1,
        });
      }
    } catch (loadError) {
      setError(loadError?.message || t('goals.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [endpoint, mode, pagination.size, studentId, t]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const selectedEntry = useMemo(
    () => goals.find((entry) => entry.goal?.id === selectedGoalId) || null,
    [goals, selectedGoalId]
  );

  const saveFeedback = async (goalId, checkInId, teacherFeedback) => {
    const response = await api.put(`/teacher/students/${studentId}/goals/${goalId}/feedback`, {
      checkin_id: checkInId,
      teacher_feedback: teacherFeedback,
    });
    addFlash(t('checkins.feedbackSaved'), 'success');
    if (response.changed) await loadGoals();
  };

  if (loading) {
    return <div className="space-y-5" aria-busy="true" aria-label={t('common.loading')}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-6 text-danger-700 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-300" role="alert">
        <p className="font-semibold">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => loadGoals(pagination.page)}>{t('goals.retryLoad')}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-semibold text-primary-600 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200" to={backTo}>{t('common.backToList')}</Link>
          <h1 className="mt-2 text-2xl font-bold text-primary-950 dark:text-gray-100">{t('goals.studentProgress', { name: studentId })}</h1>
          <p className="mt-1 text-primary-600 dark:text-gray-400">{t('goals.studentProgressDesc')}</p>
        </div>
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
            <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-5 dark:border-gray-800" aria-label={t('common.actions')}>
              <p className="text-sm text-primary-600 dark:text-gray-400">{t('common.showing', { start: (pagination.page - 1) * pagination.size + 1, end: Math.min(pagination.page * pagination.size, pagination.total), total: pagination.total })}</p>
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
