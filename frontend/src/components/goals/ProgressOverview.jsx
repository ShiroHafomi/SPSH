import { Activity, CalendarDays, TrendingUp } from 'lucide-react';
import { Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { asFiniteNumber, formatGoalDate, formatMetric } from '../../utils/goalProgress';
import ProgressStatusBadge from './ProgressStatusBadge';

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-surface-muted p-3">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1 text-base font-bold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export default function ProgressOverview({ goal, progress }) {
  const { lang, t } = useLanguage();
  const metric = (value, options = {}) => formatMetric(value, { ...options, language: lang });
  const remainingDays = asFiniteNumber(progress?.remainingDays);
  const hasRemainingDays = remainingDays !== null;
  const deadlineLabel = hasRemainingDays
    ? remainingDays < 0
      ? t('progress.overdueDays', { count: Math.abs(remainingDays) })
      : t('progress.remainingDays', { count: remainingDays })
    : t('progress.deadlineUnavailable');

  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-ink-muted">
            <Activity className="h-4 w-4" aria-hidden="true" />
            <h3 className="font-semibold">{t('progress.title')}</h3>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {formatGoalDate(goal?.deadline, lang)} · {deadlineLabel}
          </p>
        </div>
        <ProgressStatusBadge status={progress?.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label={t('progress.latestScore')} value={metric(progress?.latestRecordedScore)} />
        <Metric label={t('progress.scoreChange')} value={metric(progress?.scoreChange)} />
        <Metric label={t('progress.distanceFromTarget')} value={metric(progress?.distanceFromTargetScore)} />
        <Metric label={t('progress.percentage')} value={metric(progress?.progressPercentage, { suffix: '%' })} />
        <Metric label={t('progress.averageStudyHours')} value={metric(progress?.averageWeeklyStudyHours, { suffix: 'h' })} />
        <Metric label={t('progress.averageSleepHours')} value={metric(progress?.averageSleepHours, { suffix: 'h' })} />
        <Metric label={t('progress.averageAttendance')} value={metric(progress?.averageAttendance, { suffix: '%' })} />
        <Metric label={t('progress.checkinCount')} value={metric(progress?.totalCheckIns, { digits: 0 })} />
      </dl>

      <p className="sr-only">
        {t('progress.textualSummary', {
          status: t('progress.status.' + ({
            on_track: 'onTrack',
            needs_attention: 'needsAttention',
            insufficient_data: 'insufficientData',
            completed: 'completed',
            overdue: 'overdue',
          }[progress?.status] || 'insufficientData')),
          count: metric(progress?.totalCheckIns, { digits: 0 }),
        })}
      </p>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        {t('goals.status')}: {goal?.status ? t(`goals.statusLabel.${goal.status}`) : '—'}
      </div>
    </Card>
  );
}
