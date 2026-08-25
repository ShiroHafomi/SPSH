import { CalendarDays, Target } from 'lucide-react';
import { Button, Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { formatGoalDate, formatMetric } from '../../utils/goalProgress';
import ProgressStatusBadge from './ProgressStatusBadge';

export default function GoalSummaryCard({ entry, actions, onSelect }) {
  const { t } = useLanguage();
  const { goal, progress } = entry;
  const targets = [
    goal?.target_score !== null && goal?.target_score !== undefined && `${t('goals.targetScore')}: ${formatMetric(goal.target_score)}`,
    goal?.target_grade && `${t('goals.targetGrade')}: ${goal.target_grade}`,
    goal?.target_study_hours !== null && goal?.target_study_hours !== undefined && `${t('goals.targetStudyHours')}: ${formatMetric(goal.target_study_hours, { suffix: 'h' })}`,
    goal?.target_attendance !== null && goal?.target_attendance !== undefined && `${t('goals.targetAttendance')}: ${formatMetric(goal.target_attendance, { suffix: '%' })}`,
  ].filter(Boolean);

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-bold text-primary-950 dark:text-gray-100">{t('goals.title')}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-primary-500 dark:text-gray-500">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {formatGoalDate(goal?.deadline)}
            </p>
          </div>
        </div>
        <ProgressStatusBadge status={progress?.status} />
      </div>

      <div className="flex flex-wrap gap-2">
        {targets.length ? targets.map((target) => (
          <span key={target} className="rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-gray-800 dark:text-gray-300">
            {target}
          </span>
        )) : (
          <span className="text-sm text-primary-500 dark:text-gray-500">{t('goals.noTargets')}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4 dark:border-gray-800">
        <span className="text-sm text-primary-600 dark:text-gray-400">
          {t('progress.percentage')}: <strong className="tabular-nums text-primary-950 dark:text-gray-100">{formatMetric(progress?.progressPercentage, { suffix: '%' })}</strong>
        </span>
        <div className="flex flex-wrap gap-2">
          {onSelect && <Button size="sm" variant="outline" onClick={() => onSelect(entry)}>{t('goals.viewProgress')}</Button>}
          {actions}
        </div>
      </div>
    </Card>
  );
}
