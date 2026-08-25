import { MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import { Button, Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { formatGoalDate, formatMetric, sortCheckInsChronologically } from '../../utils/goalProgress';

function CheckinMetric({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-primary-500 dark:text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-primary-950 dark:text-gray-100">{value}</dd>
    </div>
  );
}

export default function CheckinHistory({ checkIns, onEdit, onDelete, renderFeedback, headerAction }) {
  const { t } = useLanguage();
  const orderedCheckIns = sortCheckInsChronologically(checkIns);

  return (
    <section aria-labelledby="checkin-history-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="checkin-history-title" className="text-lg font-bold text-primary-950 dark:text-gray-100">{t('checkins.title')}</h2>
        {headerAction}
      </div>
      {!orderedCheckIns.length ? (
        <Card padding="lg" className="text-center text-sm text-primary-600 dark:text-gray-400">
          <p>{t('checkins.noCheckins')}</p>
          <p className="mt-1 text-primary-500 dark:text-gray-500">{t('checkins.noCheckinsDesc')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {orderedCheckIns.map((checkIn) => (
            <Card key={checkIn.id} padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-primary-950 dark:text-gray-100">{formatGoalDate(checkIn.week_start)}</h3>
                  {checkIn.student_note && <p className="mt-2 max-w-2xl text-sm text-primary-600 dark:text-gray-400">{checkIn.student_note}</p>}
                </div>
                {(onEdit || onDelete) && (
                  <div className="flex gap-2">
                    {onEdit && <Button size="sm" variant="outline" onClick={() => onEdit(checkIn)} aria-label={t('checkins.editCheckin')}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>}
                    {onDelete && <Button size="sm" variant="danger" onClick={() => onDelete(checkIn)} aria-label={t('checkins.deleteCheckin')}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>}
                  </div>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-primary-100 pt-4 sm:grid-cols-4 dark:border-gray-800">
                <CheckinMetric label={t('checkins.studyHours')} value={formatMetric(checkIn.study_hours, { suffix: 'h' })} />
                <CheckinMetric label={t('checkins.sleepHours')} value={formatMetric(checkIn.sleep_hours, { suffix: 'h' })} />
                <CheckinMetric label={t('checkins.attendance')} value={formatMetric(checkIn.attendance_percent, { suffix: '%' })} />
                <CheckinMetric label={t('checkins.currentScore')} value={formatMetric(checkIn.current_score)} />
              </dl>
              {checkIn.teacher_feedback && !renderFeedback && (
                <div className="mt-4 flex gap-2 rounded-xl bg-primary-50 p-3 text-sm text-primary-700 dark:bg-gray-800 dark:text-gray-300">
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div><span className="font-semibold">{t('checkins.teacherFeedback')}:</span> {checkIn.teacher_feedback}</div>
                </div>
              )}
              {renderFeedback?.(checkIn)}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
