import { CalendarDays, Target } from 'lucide-react';
import { Button, Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { formatGoalDate, formatMetric } from '../../utils/goalProgress';
import ProgressStatusBadge from './ProgressStatusBadge';

export default function GoalSummaryCard({ entry, actions, onSelect }) {
  const { lang, t } = useLanguage();
  const { goal, progress } = entry;
  const metric = (value, options = {}) => formatMetric(value, { ...options, language: lang });
  const targets = [
    goal?.target_score !== null && goal?.target_score !== undefined && `${t('goals.targetScore')}: ${metric(goal.target_score)}`,
    goal?.target_grade && `${t('goals.targetGrade')}: ${goal.target_grade}`,
    goal?.target_study_hours !== null && goal?.target_study_hours !== undefined && `${t('goals.targetStudyHours')}: ${metric(goal.target_study_hours, { suffix: 'h' })}`,
    goal?.target_attendance !== null && goal?.target_attendance !== undefined && `${t('goals.targetAttendance')}: ${metric(goal.target_attendance, { suffix: '%' })}`,
  ].filter(Boolean);

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action-muted text-action-strong">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-bold text-ink">{t('goals.title')}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {formatGoalDate(goal?.deadline, lang)}
            </p>
          </div>
        </div>
        <ProgressStatusBadge status={progress?.status} />
      </div>

      <div className="flex flex-wrap gap-2">
        {targets.length ? targets.map((target) => (
          <span key={target} className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink">
            {target}
          </span>
        )) : (
          <span className="text-sm text-ink-muted">{t('goals.noTargets')}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
        <span className="text-sm text-ink-muted">
          {t('progress.percentage')}: <strong className="tabular-nums text-ink">{metric(progress?.progressPercentage, { suffix: '%' })}</strong>
        </span>
        <div className="flex flex-wrap gap-2">
          {onSelect && <Button size="sm" variant="outline" onClick={() => onSelect(entry)}>{t('goals.viewProgress')}</Button>}
          {actions}
        </div>
      </div>
    </Card>
  );
}
