import { Activity, CalendarDays, TrendingUp } from 'lucide-react';
import { Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { formatGoalDate, formatMetric } from '../../utils/goalProgress';
import ProgressStatusBadge from './ProgressStatusBadge';

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-primary-50 p-3 dark:bg-gray-800/70">
      <dt className="text-xs font-medium text-primary-600 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-base font-bold tabular-nums text-primary-950 dark:text-gray-100">{value}</dd>
    </div>
  );
}

export default function ProgressOverview({ goal, progress }) {
  const { t } = useLanguage();
  const remainingDays = Number(progress?.remainingDays);
  const hasRemainingDays = Number.isFinite(remainingDays);
  const deadlineLabel = hasRemainingDays
    ? remainingDays < 0
      ? t('progress.overdueDays', { count: Math.abs(remainingDays) })
      : t('progress.remainingDays', { count: remainingDays })
    : t('progress.deadlineUnavailable');

  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary-600 dark:text-gray-400">
            <Activity className="h-4 w-4" aria-hidden="true" />
            <h3 className="font-semibold">{t('progress.title')}</h3>
          </div>
          <p className="mt-1 text-sm text-primary-500 dark:text-gray-500">
            {formatGoalDate(goal?.deadline)} · {deadlineLabel}
          </p>
        </div>
        <ProgressStatusBadge status={progress?.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label={t('progress.latestScore')} value={formatMetric(progress?.latestRecordedScore)} />
        <Metric label={t('progress.scoreChange')} value={formatMetric(progress?.scoreChange)} />
        <Metric label={t('progress.distanceFromTarget')} value={formatMetric(progress?.distanceFromTargetScore)} />
        <Metric label={t('progress.percentage')} value={formatMetric(progress?.progressPercentage, { suffix: '%' })} />
        <Metric label={t('progress.averageStudyHours')} value={formatMetric(progress?.averageWeeklyStudyHours, { suffix: 'h' })} />
        <Metric label={t('progress.averageSleepHours')} value={formatMetric(progress?.averageSleepHours, { suffix: 'h' })} />
        <Metric label={t('progress.averageAttendance')} value={formatMetric(progress?.averageAttendance, { suffix: '%' })} />
        <Metric label={t('progress.checkinCount')} value={formatMetric(progress?.totalCheckIns, { digits: 0 })} />
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
          count: formatMetric(progress?.totalCheckIns, { digits: 0 }),
        })}
      </p>
      <div className="flex items-center gap-2 text-xs text-primary-500 dark:text-gray-500">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        {t('goals.status')}: {goal?.status ? t(`goals.statusLabel.${goal.status}`) : '—'}
      </div>
    </Card>
  );
}
