import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Modal, Select } from '../ui';
import { useLanguage } from '../../hooks/useLanguage';
import { GOAL_GRADES, GOAL_STATUSES, createGoalSchema, goalPayload } from '../../utils/goalProgress';

function valuesFromGoal(goal) {
  return {
    target_score: goal?.target_score ?? '',
    target_grade: goal?.target_grade ?? '',
    target_study_hours: goal?.target_study_hours ?? '',
    target_attendance: goal?.target_attendance ?? '',
    deadline: typeof goal?.deadline === 'string' ? goal.deadline.slice(0, 10) : '',
    status: goal?.status || 'active',
  };
}

export default function GoalForm({ isOpen, onClose, goal, onSave }) {
  const { t } = useLanguage();
  const isEdit = Boolean(goal?.id);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createGoalSchema(t)),
    defaultValues: valuesFromGoal(goal),
  });

  useEffect(() => {
    if (isOpen) reset(valuesFromGoal(goal));
  }, [goal, isOpen, reset]);

  const submit = async (values) => {
    try {
      await onSave(goalPayload(values), goal);
      onClose();
    } catch (error) {
      setError('root', { message: error?.message || t('goals.loadFailed') });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('goals.editGoal') : t('goals.createGoal')}
      size="lg"
      hideFooter
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {errors.root?.message && <p className="form-field-error" role="alert">{errors.root.message}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="target_score"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="100" step="0.01" label={t('goals.targetScore')} error={errors.target_score?.message} />}
          />
          <Controller
            name="target_grade"
            control={control}
            render={({ field }) => <Select {...field} value={field.value ?? ''} label={t('goals.targetGrade')} error={errors.target_grade?.message} options={GOAL_GRADES.map((grade) => ({ value: grade, label: grade }))} placeholder={t('common.select')} />}
          />
          <Controller
            name="target_study_hours"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="112" step="0.01" label={t('goals.targetStudyHours')} error={errors.target_study_hours?.message} />}
          />
          <Controller
            name="target_attendance"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="number" min="0" max="100" step="0.01" label={t('goals.targetAttendance')} error={errors.target_attendance?.message} />}
          />
          <Controller
            name="deadline"
            control={control}
            render={({ field }) => <Input {...field} value={field.value ?? ''} type="date" label={t('goals.deadline')} error={errors.deadline?.message} />}
          />
          {isEdit && (
            <Controller
              name="status"
              control={control}
              render={({ field }) => <Select {...field} value={field.value} label={t('goals.status')} error={errors.status?.message} options={GOAL_STATUSES.map((status) => ({ value: status, label: t(`goals.statusLabel.${status}`) }))} />}
            />
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-divider pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>{isEdit ? t('common.save') : t('goals.createGoal')}</Button>
        </div>
      </form>
    </Modal>
  );
}
