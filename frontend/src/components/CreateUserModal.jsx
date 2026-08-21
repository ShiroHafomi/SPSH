import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import { Button, Icon, Input, Modal, Select } from './ui';
import {
  buildCreateUserPayload,
  createAdminUserSchema,
} from '../utils/adminUserValidation';

const DEFAULT_VALUES = {
  name: '',
  email: '',
  password: '',
  role: 'student',
  studentId: '',
  department: '',
};

export function CreateUserModal({ isOpen, onClose, onCreated }) {
  const { t } = useLanguage();
  const schema = useMemo(() => createAdminUserSchema(t), [t]);
  const [showPassword, setShowPassword] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
    shouldUnregister: true,
  });

  const role = watch('role');

  const resetAndClose = () => {
    if (isSubmitting) return;
    reset(DEFAULT_VALUES);
    setShowPassword(false);
    setServerErrors([]);
    onClose();
  };

  const onSubmit = async (values) => {
    setServerErrors([]);

    try {
      const data = await api.post('/admin/users', buildCreateUserPayload(values));
      reset(DEFAULT_VALUES);
      setShowPassword(false);
      await onCreated(data.user);
      onClose();
    } catch (error) {
      const messages = error.errors?.length
        ? error.errors
        : [error.message || t('admin.createUserFailed')];

      if (error.status === 409) {
        setError('email', { type: 'server', message: error.message }, { shouldFocus: true });
      }
      setServerErrors(messages);
    }
  };

  const roleOptions = [
    { value: 'student', label: t('nav.role.student') },
    { value: 'teacher', label: t('nav.role.teacher') },
    { value: 'admin', label: t('nav.role.admin') },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={t('admin.addUser')}
      description={t('admin.addUserDesc')}
      size="default"
      showCloseButton={!isSubmitting}
      closeOnEscape={!isSubmitting}
      closeOnOverlayClick={!isSubmitting}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={resetAndClose}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="create-user-form"
            loading={isSubmitting}
            disabled={isSubmitting}
            leftIcon="userPlus"
          >
            {isSubmitting ? t('common.creating') : t('admin.createUser')}
          </Button>
        </div>
      }
    >
      <form
        id="create-user-form"
        className="space-y-4"
        onSubmit={handleSubmit(onSubmit)}
        onChange={() => {
          if (serverErrors.length) setServerErrors([]);
        }}
        noValidate
      >
        {serverErrors.length > 0 && (
          <div
            className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-900/60 dark:bg-danger-950/40 dark:text-danger-300"
            role="alert"
            aria-live="assertive"
          >
            <p className="font-semibold">{t('admin.createUserFailed')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {serverErrors.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            {...register('name')}
            label={t('admin.name')}
            placeholder={t('admin.namePlaceholder')}
            autoComplete="name"
            error={errors.name?.message}
            leftIcon="user"
            disabled={isSubmitting}
            required
          />
          <Input
            {...register('email')}
            label={t('admin.email')}
            type="email"
            placeholder={t('admin.emailPlaceholder')}
            autoComplete="email"
            error={errors.email?.message}
            leftIcon="mail"
            disabled={isSubmitting}
            required
          />
        </div>

        <Input
          {...register('password')}
          label={t('admin.password')}
          type={showPassword ? 'text' : 'password'}
          placeholder={t('admin.passwordPlaceholder')}
          autoComplete="new-password"
          error={errors.password?.message}
          hint={t('admin.passwordHint')}
          leftIcon="lock"
          disabled={isSubmitting}
          required
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="rounded-lg p-1.5 text-primary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:text-primary-400"
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              disabled={isSubmitting}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-5 w-5" />
            </button>
          }
        />

        <Select
          {...register('role')}
          label={t('admin.role')}
          options={roleOptions}
          error={errors.role?.message}
          disabled={isSubmitting}
          required
        />

        {role === 'student' && (
          <Input
            {...register('studentId')}
            label={t('admin.studentRecordId')}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder={t('admin.studentRecordIdPlaceholder')}
            hint={t('admin.studentRecordIdHint')}
            error={errors.studentId?.message}
            disabled={isSubmitting}
          />
        )}

        {role === 'teacher' && (
          <Input
            {...register('department')}
            label={t('admin.department')}
            placeholder={t('admin.departmentPlaceholder')}
            hint={t('admin.departmentHint')}
            error={errors.department?.message}
            disabled={isSubmitting}
          />
        )}
      </form>
    </Modal>
  );
}
