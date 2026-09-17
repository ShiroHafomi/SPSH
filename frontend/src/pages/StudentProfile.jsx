import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonCard } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';

const ACADEMIC_FIELDS = [
  ['student_id', 'studentId'],
  ['gender', 'gender'],
  ['age', 'age'],
  ['previous_gpa', 'gpa'],
  ['final_score', 'finalScore'],
  ['grade', 'grade'],
  ['attendance_percent', 'attendance'],
  ['study_hours_per_day', 'studyHours'],
  ['sleep_hours', 'sleepHours'],
];

function displayValue(value, t) {
  return value === null || value === undefined || value === '' ? t('studentProfile.notProvided') : String(value);
}

function validateName(value, t) {
  const name = value.trim();
  if (name.length < 2 || name.length > 100) return t('studentProfile.validation.name');
  if (!/^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(name)) return t('studentProfile.validation.nameCharacters');
  return null;
}

function validatePassword(value, t) {
  if (value.length < 8) return t('studentProfile.validation.passwordLength');
  if (new TextEncoder().encode(value).length > 72) return t('studentProfile.validation.passwordBytes');
  if (!/[A-Z]/.test(value)) return t('studentProfile.validation.passwordUppercase');
  if (!/[a-z]/.test(value)) return t('studentProfile.validation.passwordLowercase');
  if (!/\d/.test(value)) return t('studentProfile.validation.passwordDigit');
  return null;
}

export default function StudentProfile() {
  const { user: authUser, refreshUser } = useAuth();
  const { t } = useLanguage();
  const requestRef = useRef(0);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [savingName, setSavingName] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [mutationError, setMutationError] = useState('');

  const loadProfile = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get('/student/me/profile');
      if (requestId !== requestRef.current) return;
      setProfile(response);
      setName(response?.user?.name || authUser?.name || '');
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setProfile(null);
      setLoadError(error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [authUser?.name]);

  useEffect(() => {
    loadProfile();
    return () => { requestRef.current += 1; };
  }, [loadProfile]);

  const updateName = async (event) => {
    event.preventDefault();
    const validationError = validateName(name, t);
    if (validationError) {
      setNameError(validationError);
      return;
    }
    setNameError('');
    setMutationError('');
    setNotice('');
    setSavingName(true);
    try {
      const response = await api.patch('/student/me/profile', { name });
      setProfile((current) => ({ ...current, user: response.user }));
      setName(response.user.name);
      await refreshUser();
      setNotice(t('studentProfile.nameSaved'));
    } catch (error) {
      setMutationError(error.message || t('studentProfile.updateFailed'));
    } finally {
      setSavingName(false);
    }
  };

  const updatePasswordField = (field, value) => {
    setPasswords((current) => ({ ...current, [field]: value }));
    setPasswordErrors((current) => ({ ...current, [field]: '', form: '' }));
    setMutationError('');
    setNotice('');
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!passwords.currentPassword) errors.currentPassword = t('studentProfile.validation.currentPassword');
    const passwordError = validatePassword(passwords.newPassword, t);
    if (passwordError) errors.newPassword = passwordError;
    if (passwords.newPassword !== passwords.confirmPassword) errors.confirmPassword = t('studentProfile.validation.passwordMatch');
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    setMutationError('');
    setNotice('');
    setChangingPassword(true);
    try {
      await api.patch('/student/me/profile', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setNotice(t('studentProfile.passwordSaved'));
    } catch (error) {
      setMutationError(error.message || t('studentProfile.updateFailed'));
    } finally {
      setChangingPassword(false);
    }
  };

  const cancelName = () => {
    setName(profile?.user?.name || authUser?.name || '');
    setNameError('');
  };

  if (loading) {
    return <div className="space-y-5" aria-busy="true" aria-label={t('studentProfile.loading')}><SkeletonCard /><SkeletonCard /></div>;
  }

  if (loadError) {
    const unavailable = loadError.status === 400 || loadError.status === 404;
    return <ErrorState title={t(unavailable ? 'studentProfile.unavailable' : 'studentProfile.loadFailed')} description={t(unavailable ? 'studentProfile.unavailableDesc' : 'studentProfile.loadFailedDesc')} action={loadProfile} actionLabel={t('studentProfile.retry')} />;
  }

  if (!profile?.student || !profile?.user) {
    return <EmptyState title={t('studentProfile.emptyTitle')} description={t('studentProfile.emptyDesc')} action={loadProfile} actionLabel={t('studentProfile.retry')} />;
  }

  const account = profile.user;
  const student = profile.student;
  const roleLabel = t(`nav.role.${account.role}`);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title={t('studentProfile.title')} subtitle={t('studentProfile.subtitle')} actions={<Button onClick={loadProfile} leftIcon="refreshCw">{t('studentProfile.refresh')}</Button>} />

      <div aria-live="polite" className="space-y-2">
        {notice && <p className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm font-medium text-success-700 dark:border-success-900/50 dark:bg-success-950/30 dark:text-success-300">{notice}</p>}
        {mutationError && <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-300">{mutationError}</p>}
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" aria-label={t('studentProfile.accountSection')}>
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-bold text-ink">{t('studentProfile.accountTitle')}</h2><p className="mt-1 text-sm text-ink-muted">{t('studentProfile.accountDescription')}</p></div>
            <Badge variant="info">{roleLabel}</Badge>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('studentProfile.email')}</dt><dd className="mt-1 break-words font-medium text-ink">{account.email}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('studentProfile.role')}</dt><dd className="mt-1 font-medium text-ink">{roleLabel}</dd></div>
          </dl>
          <form className="mt-6 border-t border-divider pt-6" onSubmit={updateName}>
            <Input label={t('studentProfile.name')} value={name} onChange={(event) => { setName(event.target.value); setNameError(''); setMutationError(''); }} error={nameError} required maxLength={100} />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={cancelName} disabled={savingName}>{t('common.cancel')}</Button>
              <Button type="submit" loading={savingName}>{t('studentProfile.saveName')}</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-ink">{t('studentProfile.passwordTitle')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('studentProfile.passwordDescription')}</p>
          <form className="mt-6 space-y-4" onSubmit={changePassword}>
            <Input type="password" label={t('studentProfile.currentPassword')} value={passwords.currentPassword} onChange={(event) => updatePasswordField('currentPassword', event.target.value)} error={passwordErrors.currentPassword} autoComplete="current-password" required />
            <Input type="password" label={t('studentProfile.newPassword')} hint={t('studentProfile.passwordHint')} value={passwords.newPassword} onChange={(event) => updatePasswordField('newPassword', event.target.value)} error={passwordErrors.newPassword} autoComplete="new-password" required />
            <Input type="password" label={t('studentProfile.confirmPassword')} value={passwords.confirmPassword} onChange={(event) => updatePasswordField('confirmPassword', event.target.value)} error={passwordErrors.confirmPassword} autoComplete="new-password" required />
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPasswordErrors({}); }} disabled={changingPassword}>{t('common.cancel')}</Button>
              <Button type="submit" loading={changingPassword}>{t('studentProfile.changePassword')}</Button>
            </div>
          </form>
        </Card>
      </section>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-ink">{t('studentProfile.academicTitle')}</h2><p className="mt-1 text-sm text-ink-muted">{t('studentProfile.academicDescription')}</p></div><Badge variant="default">{t('studentProfile.readOnly')}</Badge></div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ACADEMIC_FIELDS.map(([field, label]) => (
            <div key={field}><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(`studentProfile.fields.${label}`)}</dt><dd className="mt-1 font-medium text-ink">{displayValue(student[field], t)}</dd></div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
