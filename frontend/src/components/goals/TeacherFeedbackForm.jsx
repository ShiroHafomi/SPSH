import { useState } from 'react';
import { Button, Textarea } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';

export default function TeacherFeedbackForm({ checkIn, onSave }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(checkIn?.teacher_feedback || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const feedback = value.trim();
    if (!feedback) return;

    setSaving(true);
    setError('');
    try {
      await onSave(checkIn.id, feedback);
    } catch (saveError) {
      setError(saveError?.message || t('checkins.feedbackFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 border-t border-divider pt-4">
      <Textarea
        name={`teacher-feedback-${checkIn.id}`}
        label={t('checkins.teacherFeedback')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={1000}
        rows={3}
        error={error}
      />
      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm" loading={saving} disabled={saving || !value.trim()}>
          {checkIn.teacher_feedback ? t('checkins.updateFeedback') : t('checkins.addFeedback')}
        </Button>
      </div>
    </form>
  );
}
