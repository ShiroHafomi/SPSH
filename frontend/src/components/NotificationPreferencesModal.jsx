import { useEffect, useState } from 'react';
import { Button, Modal, useFlash } from './ui';
import { useLanguage } from '../hooks/useLanguage';
import { useNotifications } from '../hooks/useNotifications';

const preferenceFields = [
  {
    key: 'goalReminders',
    labelKey: 'notifications.preferences.goalReminders.label',
    descriptionKey: 'notifications.preferences.goalReminders.description',
  },
  {
    key: 'checkinReminders',
    labelKey: 'notifications.preferences.checkinReminders.label',
    descriptionKey: 'notifications.preferences.checkinReminders.description',
  },
  {
    key: 'teacherFeedback',
    labelKey: 'notifications.preferences.teacherFeedback.label',
    descriptionKey: 'notifications.preferences.teacherFeedback.description',
  },
  {
    key: 'riskAlerts',
    labelKey: 'notifications.preferences.riskAlerts.label',
    descriptionKey: 'notifications.preferences.riskAlerts.description',
  },
];

function toPreferenceDraft(value) {
  return preferenceFields.reduce((draft, { key }) => ({
    ...draft,
    [key]: value?.[key] === true,
  }), {});
}

export function NotificationPreferencesModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const {
    loadPreferences,
    updatePreferences,
    preferences,
    preferencesLoading,
    preferencesError,
    isMutating,
  } = useNotifications();
  const [draft, setDraft] = useState(() => toPreferenceDraft(null));
  const [saveError, setSaveError] = useState('');
  const saving = isMutating('preferences');
  const canSave = Boolean(preferences);

  useEffect(() => {
    if (!isOpen) return undefined;

    let active = true;
    setSaveError('');
    loadPreferences()
      .then((value) => {
        if (active && value) setDraft(toPreferenceDraft(value));
      })
      .catch((error) => {
        if (active) setSaveError(error?.message || '');
      });

    return () => {
      active = false;
    };
  }, [isOpen, loadPreferences]);

  useEffect(() => {
    if (isOpen && preferences) setDraft(toPreferenceDraft(preferences));
  }, [isOpen, preferences]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || preferencesLoading || !canSave) return;

    setSaveError('');
    try {
      const nextPreferences = await updatePreferences(draft);
      if (nextPreferences) setDraft(toPreferenceDraft(nextPreferences));
      addFlash(t('notifications.preferences.saved'), 'success');
      onClose();
    } catch (error) {
      setSaveError(error?.message || '');
    }
  };

  const errorMessage = saveError || preferencesError;

  const retryLoad = () => {
    setSaveError('');
    loadPreferences({ force: true })
      .then((value) => {
        if (value) setDraft(toPreferenceDraft(value));
      })
      .catch((error) => setSaveError(error?.message || ''));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('notifications.preferences.title')}
      description={t('notifications.preferences.subtitle')}
      size="default"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('notifications.cancel')}
          </Button>
          <Button
            type="submit"
            form="notification-preferences-form"
            loading={saving}
            disabled={preferencesLoading || !canSave}
            leftIcon="check"
          >
            {t('notifications.preferences.save')}
          </Button>
        </div>
      )}
    >
      <form id="notification-preferences-form" className="space-y-5" onSubmit={handleSubmit}>
        <p className="rounded-xl border border-primary-100 bg-primary-50 p-3 text-sm leading-5 text-primary-700 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-200">
          {t('notifications.preferences.help')}
        </p>

        {preferencesLoading && !preferences && (
          <p className="text-sm text-primary-600 dark:text-gray-300" role="status">
            {t('notifications.loading')}
          </p>
        )}

        {errorMessage && (
          <div
            className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-300"
            role="alert"
          >
            <span>{t('notifications.preferences.saveError')}</span>
            {!canSave && !preferencesLoading && (
              <Button variant="ghost" size="sm" onClick={retryLoad}>
                {t('notifications.retry')}
              </Button>
            )}
          </div>
        )}

        <fieldset className="space-y-3" disabled={preferencesLoading || saving || !canSave}>
          <legend className="sr-only">{t('notifications.preferences.title')}</legend>
          {preferenceFields.map(({ key, labelKey, descriptionKey }) => {
            const inputId = `notification-preference-${key}`;
            return (
              <label
                key={key}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-100 bg-white p-3 transition-colors hover:border-primary-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-primary-700"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, [key]: event.target.checked }));
                  }}
                  className="mt-0.5 size-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-primary-950 dark:text-gray-100">
                    {t(labelKey)}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-primary-600 dark:text-gray-300">
                    {t(descriptionKey)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </form>
    </Modal>
  );
}
