import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, PageHeader, SkeletonCard } from '../components/ui';
import { useLanguage } from '../hooks/useLanguage';
import { getStudentRecommendationsViewState, normalizeStudentRecommendations } from '../utils/studentRecommendations';

const STATUS_VARIANTS = {
  Excellent: 'success',
  'On Track': 'info',
  'Needs Attention': 'warning',
  'At Risk': 'danger',
};

const PRIORITY_VARIANTS = { high: 'danger', medium: 'warning', low: 'success' };

function valueText(value, t) {
  if (value === null || value === undefined || value === '') return t('studentRecommendations.notAvailable');
  return String(value);
}

export default function StudentRecommendations() {
  const { t } = useLanguage();
  const requestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const loadRecommendations = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/student/me/recommendations');
      if (requestId !== requestRef.current) return;
      setData(normalizeStudentRecommendations(response));
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setData(null);
      setError(loadError);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
    return () => { requestRef.current += 1; };
  }, [loadRecommendations]);

  const viewState = getStudentRecommendationsViewState({ loading, error, data });
  if (viewState === 'loading') {
    return <div className="space-y-5" aria-busy="true" aria-label={t('studentRecommendations.loading')}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }

  if (viewState === 'error') {
    const missingProfile = error?.status === 400 || error?.status === 404;
    return (
      <ErrorState
        title={t(missingProfile ? 'studentRecommendations.profileUnavailable' : 'studentRecommendations.loadFailed')}
        description={t(missingProfile ? 'studentRecommendations.profileUnavailableDesc' : 'studentRecommendations.loadFailedDesc')}
        action={loadRecommendations}
        actionLabel={t('studentRecommendations.retry')}
      />
    );
  }

  if (viewState === 'empty') {
    return (
      <EmptyState
        icon="sparkles"
        title={t('studentRecommendations.emptyTitle')}
        description={t('studentRecommendations.emptyDesc')}
        action={loadRecommendations}
        actionLabel={t('studentRecommendations.refresh')}
      />
    );
  }

  const { overallStatus, recommendations, summary, dataAvailability } = data;
  return (
    <div className="mx-auto max-w-7xl space-y-8" aria-busy={loading ? 'true' : 'false'}>
      <PageHeader
        title={t('studentRecommendations.title')}
        subtitle={t('studentRecommendations.subtitle')}
        actions={<Button onClick={loadRecommendations} leftIcon="refreshCw">{t('studentRecommendations.refresh')}</Button>}
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]" aria-labelledby="recommendations-status-title">
        <Card className="border-primary-200 bg-primary-50/50 dark:border-primary-900/50 dark:bg-primary-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-muted">{t('studentRecommendations.statusLabel')}</p>
              <h2 id="recommendations-status-title" className="mt-2 text-2xl font-bold text-ink">{t(`studentRecommendations.status.${overallStatus}`)}</h2>
              <p className="mt-2 max-w-xl text-sm text-ink-muted">{t('studentRecommendations.statusDescription')}</p>
            </div>
            <Badge variant={STATUS_VARIANTS[overallStatus] || 'default'} size="lg">{t(`studentRecommendations.status.${overallStatus}`)}</Badge>
          </div>
        </Card>
        <Card>
          <h2 className="text-base font-bold text-ink">{t('studentRecommendations.snapshotTitle')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-ink-muted">{t('studentRecommendations.predictedScore')}</dt><dd className="mt-1 font-semibold text-ink">{valueText(summary.predictedScore, t)}</dd></div>
            <div><dt className="text-ink-muted">{t('studentRecommendations.predictedGrade')}</dt><dd className="mt-1 font-semibold text-ink">{valueText(summary.predictedGrade, t)}</dd></div>
            <div><dt className="text-ink-muted">{t('studentRecommendations.studyHours')}</dt><dd className="mt-1 font-semibold text-ink">{valueText(summary.studyHoursPerDay, t)}</dd></div>
            <div><dt className="text-ink-muted">{t('studentRecommendations.attendance')}</dt><dd className="mt-1 font-semibold text-ink">{valueText(summary.attendancePercent, t)}</dd></div>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="recommendations-list-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="recommendations-list-title" className="text-xl font-bold text-ink">{t('studentRecommendations.listTitle')}</h2><p className="mt-1 text-sm text-ink-muted">{t('studentRecommendations.listSubtitle')}</p></div>
          <span className="text-sm text-ink-muted">{t('studentRecommendations.count', { count: recommendations.length })}</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {recommendations.map((item) => (
            <Card key={`${item.id}-${item.title}`} className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-action-muted text-action-strong"><Icon name="sparkles" className="size-5" /></span><h3 className="pt-1 text-base font-bold text-ink">{t(`studentRecommendations.items.${item.id}.title`, { fallback: item.title })}</h3></div>
                <Badge variant={PRIORITY_VARIANTS[item.priority] || 'default'}>{t(`studentRecommendations.priority.${item.priority}`)}</Badge>
              </div>
              <p className="mt-4 text-sm leading-6 text-ink-muted">{t(`studentRecommendations.items.${item.id}.explanation`, { fallback: item.explanation })}</p>
              <div className="mt-5 grid gap-3 rounded-xl bg-surface-muted p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('studentRecommendations.currentValue')}</p><p className="mt-1 font-semibold text-ink">{valueText(item.currentValue, t)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('studentRecommendations.suggestedValue')}</p><p className="mt-1 font-semibold text-ink">{valueText(item.suggestedValue, t)}</p></div>
              </div>
              <div className="mt-auto border-t border-divider pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('studentRecommendations.nextStep')}</p><p className="mt-1 text-sm font-medium text-ink">{t(`studentRecommendations.items.${item.id}.nextStep`, { fallback: item.nextStep })}</p></div>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-ink-muted">{t('studentRecommendations.privacyNote')} {Object.values(dataAvailability).some(Boolean) ? '' : t('studentRecommendations.partialData')}</p>
    </div>
  );
}
