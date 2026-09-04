import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Modal, Textarea } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { checkinPayload, createWeeklyCheckinSchema } from '../../utils/goalProgress';

function valuesFromCheckin(checkIn) {
  return {
    week_start: typeof checkIn?.week_start === 'string' ? checkIn.week_start.slice(0, 10) : '',
    study_hours: checkIn?.study_hours ?? '',
    sleep_hours: checkIn?.sleep_hours ?? '',
    attendance_percent: checkIn?.attendance_percent ?? '',
    current_score: checkIn?.current_score ?? '',
    student_note: checkIn?.student_note ?? '',
  };
}

export default function WeeklyCheckinForm({ isOpen, onClose, checkIn, checkIns, onSave }) {
  const { t } = useLanguage();
  const isEdit = Boolean(checkIn?.id);
  const existingWeeks = useMemo(() => new Set(
    (checkIns || [])
      .filter((item) => item?.id !== checkIn?.id)
      .map((item) => typeof item?.week_start === 'string' ? item.week_start.slice(0, 10) : '')
      .filter(Boolean)
  ), [checkIn?.id, checkIns]);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createWeeklyCheckinSchema(t)),
    defaultValues: valuesFromCheckin(checkIn),
  });

  useEffect(() => {
    if (isOpen) reset(valuesFromCheckin(checkIn));
  }, [checkIn, isOpen, reset]);

  const submit = async (values) => {
    if (existingWeeks.has(values.week_start)) {
      setError('week_start', { message: t('checkins.duplicateWeek') });
      return;
    }
    try {
      await onSave(checkinPayload(values), checkIn);
      onClose();
    } catch (error) {
      setError('root', { message: error?.message || t('checkins.saveFailed') });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('checkins.editCheckin') : t('checkins.createCheckin')}
      size="lg"
      hideFooter
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {errors.root?.message && <p className="form-field-error" role="alert">{errors.root.message}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="week_start"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="date" label={t('checkins.weekStart')} error={errors.week_start?.message} required />}
          />
          <Controller
            name="study_hours"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="24" step="0.01" label={t('checkins.studyHours')} error={errors.study_hours?.message} required />}
          />
          <Controller
            name="sleep_hours"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="24" step="0.01" label={t('checkins.sleepHours')} error={errors.sleep_hours?.message} required />}
          />
          <Controller
            name="attendance_percent"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="100" step="0.01" label={t('checkins.attendance')} error={errors.attendance_percent?.message} required />}
          />
          <Controller
            name="current_score"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="100" step="0.01" label={t('checkins.currentScore')} error={errors.current_score?.message} />}
          />
        </div>
        <Controller
          name="student_note"
          control={control}
          render={({ field }) => <Textarea {...field} value={field.value ?? ''} label={t('checkins.studentNote')} error={errors.student_note?.message} maxLength={1000} rows={3} />}
        />
        <div className="flex justify-end gap-3 border-t border-divider pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>{isEdit ? t('common.save') : t('checkins.createCheckin')}</Button>
        </div>
      </form>
    </Modal>
  );
}
