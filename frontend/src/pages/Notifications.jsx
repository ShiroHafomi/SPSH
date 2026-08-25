import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  Select,
  SkeletonCard,
  useFlash,
} from '../components/ui';
import { NotificationItem } from '../components/NotificationItem';
import { NotificationPreferencesModal } from '../components/NotificationPreferencesModal';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useNotifications } from '../hooks/useNotifications';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_VALUES,
  resolveNotificationDestination,
  toPositiveSafeInteger,
} from '../utils/notifications';

const PAGE_SIZE = 20;

function emptyPage() {
  return {
    notifications: [],
    total: 0,
    page: 1,
    size: PAGE_SIZE,
    totalPages: 0,
  };
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { addFlash } = useFlash();
  const {
    unreadCount,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    isMutating,
  } = useNotifications();
  const [listOptions, setListOptions] = useState({
    page: 1,
    size: PAGE_SIZE,
    status: 'all',
    type: '',
  });
  const [pageData, setPageData] = useState(emptyPage);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');

    fetchNotifications(listOptions)
      .then((result) => {
        if (!active) return;
        setPageData(result);
        if (result.page !== listOptions.page) {
          setListOptions((current) => ({ ...current, page: result.page }));
        }
      })
      .catch(() => {
        if (active) setLoadError(t('notifications.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchNotifications, listOptions, reloadVersion, t]);

  const refreshList = useCallback(() => {
    setReloadVersion((version) => version + 1);
  }, []);

  const updateFilter = (field, value) => {
    setListOptions((current) => ({ ...current, [field]: value, page: 1 }));
  };

  const handleNotificationActivate = async (notification) => {
    try {
      await markNotificationRead(notification?.id);
      refreshList();
      navigate(resolveNotificationDestination(notification, user?.role));
    } catch {
      addFlash(t('notifications.actionError'), 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      refreshList();
    } catch {
      addFlash(t('notifications.actionError'), 'error');
    }
  };

  const requestDelete = (notification) => {
    if (toPositiveSafeInteger(notification?.id) === null) return;
    setConfirmation(notification);
  };

  const confirmDelete = async () => {
    const id = toPositiveSafeInteger(confirmation?.id);
    if (id === null) return;

    try {
      const deleted = await deleteNotification(id);
      if (!deleted) return;

      addFlash(t('notifications.deleted'), 'success');
      setConfirmation(null);
      if (pageData.notifications.length === 1 && listOptions.page > 1) {
        setListOptions((current) => ({ ...current, page: current.page - 1 }));
      } else {
        refreshList();
      }
    } catch {
      addFlash(t('notifications.actionError'), 'error');
    }
  };

  const statusOptions = [
    { value: 'all', label: t('notifications.filters.all') },
    { value: 'unread', label: t('notifications.filters.unread') },
    { value: 'read', label: t('notifications.filters.read') },
  ];
  const typeOptions = [
    { value: '', label: t('notifications.filters.allTypes') },
    ...NOTIFICATION_TYPE_VALUES.map((type) => ({
      value: type,
      label: t(NOTIFICATION_TYPES[type].titleKey),
    })),
  ];
  const markingAllRead = isMutating('read-all');
  const deleting = confirmation ? isMutating(`delete:${confirmation.id}`) : false;
  const canGoPrevious = !loading && pageData.page > 1;
  const canGoNext = !loading && pageData.totalPages > 0 && pageData.page < pageData.totalPages;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
            <Icon name="bell" className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-primary-950 dark:text-gray-100">{t('notifications.title')}</h1>
              <Badge variant={unreadCount > 0 ? 'primary' : 'default'} size="sm">
                {t('notifications.unreadCount', { count: unreadCount })}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-primary-600 dark:text-gray-400">{t('notifications.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="secondary" size="sm" leftIcon="settings" onClick={() => setPreferencesOpen(true)}>
            {t('notifications.preferences.open')}
          </Button>
          <Button variant="secondary" size="sm" leftIcon="refresh" onClick={refreshList} disabled={loading}>
            {t('notifications.refresh')}
          </Button>
          <Button
            size="sm"
            leftIcon="checkCircle"
            onClick={handleMarkAllRead}
            loading={markingAllRead}
            disabled={unreadCount === 0}
          >
            {t('notifications.markAllRead')}
          </Button>
        </div>
      </header>

      <Card className="p-4 sm:p-5">
        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={loading}>
          <legend className="sr-only">{t('notifications.filters.title')}</legend>
          <Select
            id="notification-status-filter"
            label={t('notifications.filters.status')}
            options={statusOptions}
            value={listOptions.status}
            onChange={(event) => updateFilter('status', event.target.value)}
          />
          <Select
            id="notification-type-filter"
            label={t('notifications.filters.type')}
            options={typeOptions}
            value={listOptions.type}
            onChange={(event) => updateFilter('type', event.target.value)}
          />
        </fieldset>
      </Card>

      {loading && pageData.notifications.length === 0 && (
        <div className="space-y-3" aria-busy="true" aria-label={t('notifications.loading')}>
          <SkeletonCard className="p-5" />
          <SkeletonCard className="p-5" />
          <SkeletonCard className="p-5" />
        </div>
      )}

      {!loading && loadError && (
        <section className="rounded-2xl border border-danger-200 bg-danger-50 p-6 text-danger-700 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-300" role="alert">
          <p className="font-semibold">{loadError}</p>
          <Button className="mt-4" variant="outline" onClick={refreshList}>
            {t('notifications.retry')}
          </Button>
        </section>
      )}

      {!loading && !loadError && pageData.notifications.length === 0 && (
        <section className="rounded-2xl border border-primary-100 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <Icon name="bell" className="mx-auto size-8 text-primary-400 dark:text-gray-500" />
          <p className="mt-3 font-semibold text-primary-950 dark:text-gray-100">{t('notifications.empty')}</p>
        </section>
      )}

      {!loadError && pageData.notifications.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-clay-sm dark:border-gray-800 dark:bg-gray-900" aria-busy={loading}>
          {pageData.notifications.map((notification, index) => (
            <NotificationItem
              key={notification?.id || `notification-${index}`}
              notification={notification}
              onActivate={handleNotificationActivate}
              onDelete={requestDelete}
              readLoading={isMutating(`read:${notification?.id}`)}
              deleteLoading={isMutating(`delete:${notification?.id}`)}
            />
          ))}
        </section>
      )}

      {!loadError && pageData.totalPages > 0 && (
        <footer className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900">
          <p className="text-center text-sm text-primary-600 sm:text-left dark:text-gray-300">
            {t('notifications.pagination.summary', {
              page: pageData.page,
              totalPages: pageData.totalPages,
              total: pageData.total,
            })}
          </p>
          <div className="flex justify-center gap-2 sm:justify-end">
            <Button
              variant="secondary"
              size="sm"
              leftIcon="chevronLeft"
              disabled={!canGoPrevious}
              onClick={() => setListOptions((current) => ({ ...current, page: current.page - 1 }))}
              aria-label={t('notifications.pagination.previous')}
            >
              {t('notifications.pagination.previous')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              rightIcon="chevronRight"
              disabled={!canGoNext}
              onClick={() => setListOptions((current) => ({ ...current, page: current.page + 1 }))}
              aria-label={t('notifications.pagination.next')}
            >
              {t('notifications.pagination.next')}
            </Button>
          </div>
        </footer>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmation)}
        onClose={() => !deleting && setConfirmation(null)}
        onConfirm={confirmDelete}
        title={t('notifications.deleteConfirmTitle')}
        message={t('notifications.deleteConfirm')}
        confirmText={t('notifications.delete')}
        cancelText={t('notifications.cancel')}
        loading={deleting}
      />

      <NotificationPreferencesModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />
    </div>
  );
}
