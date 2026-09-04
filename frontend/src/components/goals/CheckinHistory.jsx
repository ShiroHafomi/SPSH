import { MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import { Button, Card } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { formatGoalDate, formatMetric, sortCheckInsChronologically } from '../../utils/goalProgress';

function CheckinMetric({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export default function CheckinHistory({ checkIns, onEdit, onDelete, renderFeedback, headerAction }) {
  const { lang, t } = useLanguage();
  const orderedCheckIns = sortCheckInsChronologically(checkIns);
  const metric = (value, options = {}) => formatMetric(value, { ...options, language: lang });

  return (
    <section aria-labelledby="checkin-history-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="checkin-history-title" className="text-lg font-bold text-ink">{t('checkins.title')}</h2>
        {headerAction}
      </div>
      {!orderedCheckIns.length ? (
        <Card padding="lg" className="text-center text-sm text-ink-muted">
          <p>{t('checkins.noCheckins')}</p>
          <p className="mt-1 text-ink-muted">{t('checkins.noCheckinsDesc')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {orderedCheckIns.map((checkIn) => (
            <Card key={checkIn.id} padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-ink">{formatGoalDate(checkIn.week_start, lang)}</h3>
                  {checkIn.student_note && <p className="mt-2 max-w-2xl break-words text-sm text-ink-muted">{checkIn.student_note}</p>}
                </div>
                {(onEdit || onDelete) && (
                  <div className="flex gap-2">
                    {onEdit && <Button size="sm" variant="outline" className="min-h-11 min-w-11" onClick={() => onEdit(checkIn)} aria-label={t('checkins.editCheckin')}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>}
                    {onDelete && <Button size="sm" variant="danger" className="min-h-11 min-w-11" onClick={() => onDelete(checkIn)} aria-label={t('checkins.deleteCheckin')}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>}
                  </div>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-divider pt-4 sm:grid-cols-4">
                <CheckinMetric label={t('checkins.studyHours')} value={metric(checkIn.study_hours, { suffix: 'h' })} />
                <CheckinMetric label={t('checkins.sleepHours')} value={metric(checkIn.sleep_hours, { suffix: 'h' })} />
                <CheckinMetric label={t('checkins.attendance')} value={metric(checkIn.attendance_percent, { suffix: '%' })} />
                <CheckinMetric label={t('checkins.currentScore')} value={metric(checkIn.current_score)} />
              </dl>
              {checkIn.teacher_feedback && !renderFeedback && (
                <div className="mt-4 flex gap-2 rounded-xl bg-action-muted p-3 text-sm text-action-strong">
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
