import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useFlash } from '../components/FlashProvider';
import { useLanguage } from '../hooks/useLanguage';
import { Button, ConfirmDialog, ErrorState, PageHeader, SkeletonCard } from '../components/ui';
import CheckinHistory from '../components/goals/CheckinHistory';
import GoalEmptyState from '../components/goals/GoalEmptyState';
import GoalForm from '../components/goals/GoalForm';
import GoalSummaryCard from '../components/goals/GoalSummaryCard';
import ProgressCharts from '../components/goals/ProgressCharts';
import ProgressOverview from '../components/goals/ProgressOverview';
import WeeklyCheckinForm from '../components/goals/WeeklyCheckinForm';
import { normalizeGoalEntries } from '../utils/goalProgress';

export default function StudentGoals() {
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [goalForm, setGoalForm] = useState({ open: false, goal: null });
  const [checkinForm, setCheckinForm] = useState({ open: false, checkIn: null });
  const [confirmation, setConfirmation] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/student/me/goals/progress');
      const entries = normalizeGoalEntries(response?.goals);
      setGoals(entries);
      setSelectedGoalId((current) => (
        entries.some((entry) => entry.goal?.id === current)
          ? current
          : entries[0]?.goal?.id ?? null
      ));
    } catch (error) {
      setLoadError(error?.message || t('goals.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const selectedEntry = useMemo(
    () => goals.find((entry) => entry.goal?.id === selectedGoalId) || null,
    [goals, selectedGoalId]
  );
  const activeGoals = useMemo(() => goals.filter((entry) => entry.goal?.status === 'active'), [goals]);
  const previousGoals = useMemo(() => goals.filter((entry) => entry.goal?.status !== 'active'), [goals]);

  const saveGoal = async (payload, goal) => {
    if (goal?.id) {
      await api.put(`/student/me/goals/${goal.id}`, payload);
      addFlash(t('goals.goalUpdated'), 'success');
    } else {
      await api.post('/student/me/goals', payload);
      addFlash(t('goals.goalCreated'), 'success');
    }
    await loadGoals();
  };

  const saveCheckin = async (payload, checkIn) => {
    const goalId = selectedEntry?.goal?.id;
    if (!goalId) return;
    if (checkIn?.id) {
      await api.put(`/student/me/goals/${goalId}/checkins/${checkIn.id}`, payload);
      addFlash(t('checkins.checkinUpdated'), 'success');
    } else {
      await api.post(`/student/me/goals/${goalId}/checkins`, payload);
      addFlash(t('checkins.checkinCreated'), 'success');
    }
    await loadGoals();
  };

  const confirmDelete = async () => {
    if (!confirmation) return;
    setDeleting(true);
    try {
      if (confirmation.type === 'goal') {
        await api.delete(`/student/me/goals/${confirmation.goal.id}`);
        addFlash(t('goals.goalDeleted'), 'success');
      } else {
        await api.delete(`/student/me/goals/${confirmation.goal.id}/checkins/${confirmation.checkIn.id}`);
        addFlash(t('checkins.checkinDeleted'), 'success');
      }
      setConfirmation(null);
      await loadGoals();
    } catch (error) {
      addFlash(error?.message || t('common.tryAgain'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const summaryActions = (entry) => (
    <>
      <Button size="sm" variant="outline" onClick={() => setGoalForm({ open: true, goal: entry.goal })}>{t('common.edit')}</Button>
      <Button size="sm" variant="danger" onClick={() => setConfirmation({ type: 'goal', goal: entry.goal })}>{t('common.delete')}</Button>
    </>
  );

  if (loading) {
    return <div className="space-y-5" aria-busy="true" aria-label={t('common.loading')}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }

  if (loadError) {
    return (
      <ErrorState
        title={t('common.failedToLoad')}
        description={loadError}
        action={loadGoals}
        actionLabel={t('goals.retryLoad')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        title={t('goals.title')}
        subtitle={t('goals.subtitle')}
        actions={(
          <Button onClick={() => setGoalForm({ open: true, goal: null })} leftIcon="plus">
            {t('goals.createGoal')}
          </Button>
        )}
      />

      {!goals.length ? (
        <GoalEmptyState canCreate onCreate={() => setGoalForm({ open: true, goal: null })} />
      ) : (
        <>
          <section aria-labelledby="active-goals-title">
            <h2 id="active-goals-title" className="mb-4 text-lg font-bold text-ink">{t('goals.activeGoals')}</h2>
            {activeGoals.length ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {activeGoals.map((entry) => <GoalSummaryCard key={entry.goal.id} entry={entry} actions={summaryActions(entry)} onSelect={(selected) => setSelectedGoalId(selected.goal.id)} />)}
              </div>
            ) : <p className="text-sm text-ink-muted">{t('goals.noActiveGoals')}</p>}
          </section>

          {previousGoals.length > 0 && (
            <section aria-labelledby="previous-goals-title">
              <h2 id="previous-goals-title" className="mb-4 text-lg font-bold text-ink">{t('goals.previousGoals')}</h2>
              <div className="grid gap-5 lg:grid-cols-2">
                {previousGoals.map((entry) => <GoalSummaryCard key={entry.goal.id} entry={entry} actions={summaryActions(entry)} onSelect={(selected) => setSelectedGoalId(selected.goal.id)} />)}
              </div>
            </section>
          )}

          {selectedEntry && (
            <section className="space-y-6" aria-label={t('goals.viewProgress')}>
              <ProgressOverview goal={selectedEntry.goal} progress={selectedEntry.progress} />
              <ProgressCharts checkIns={selectedEntry.checkIns} progress={selectedEntry.progress} />
              <CheckinHistory
                checkIns={selectedEntry.checkIns}
                headerAction={selectedEntry.goal.status === 'active' ? <Button size="sm" onClick={() => setCheckinForm({ open: true, checkIn: null })}>{t('checkins.createCheckin')}</Button> : undefined}
                onEdit={selectedEntry.goal.status === 'active' ? (checkIn) => setCheckinForm({ open: true, checkIn }) : undefined}
                onDelete={selectedEntry.goal.status === 'active' ? (checkIn) => setConfirmation({ type: 'checkin', goal: selectedEntry.goal, checkIn }) : undefined}
              />
            </section>
          )}
        </>
      )}

      <GoalForm isOpen={goalForm.open} onClose={() => setGoalForm({ open: false, goal: null })} goal={goalForm.goal} onSave={saveGoal} />
      <WeeklyCheckinForm isOpen={checkinForm.open} onClose={() => setCheckinForm({ open: false, checkIn: null })} checkIn={checkinForm.checkIn} checkIns={selectedEntry?.checkIns || []} onSave={saveCheckin} />
      <ConfirmDialog
        isOpen={Boolean(confirmation)}
        onClose={() => !deleting && setConfirmation(null)}
        onConfirm={confirmDelete}
        title={confirmation?.type === 'goal' ? t('goals.deleteGoal') : t('checkins.deleteCheckin')}
        message={confirmation?.type === 'goal' ? t('goals.deleteGoalConfirm') : t('checkins.deleteCheckinConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={deleting}
      />
    </div>
  );
}
