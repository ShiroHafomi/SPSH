import { Button, Icon } from './ui';
import { useLanguage } from '../hooks/useLanguage';
import {
  formatNotificationDateTime,
  getNotificationMessageParams,
  getNotificationPresentation,
  isUnreadNotification,
} from '../utils/notifications';

const toneClasses = {
  warning: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
  danger: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300',
  success: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300',
};

export function NotificationItem({
  notification,
  onActivate,
  onDelete,
  actionRef,
  readLoading = false,
  deleteLoading = false,
  compact = false,
}) {
  const { t, lang } = useLanguage();
  const presentation = getNotificationPresentation(notification);
  const isUnread = isUnreadNotification(notification);
  const title = presentation
    ? t(presentation.titleKey)
    : t('notifications.generic.title');
  const message = presentation
    ? t(presentation.messageKey, getNotificationMessageParams(notification, lang))
    : t('notifications.generic.message');
  const timestamp = formatNotificationDateTime(notification?.createdAt, lang)
    || t('notifications.timeUnavailable');
  const icon = presentation?.icon || 'bell';
  const tone = toneClasses[presentation?.tone] || toneClasses.primary;
  const isBusy = readLoading || deleteLoading;

  return (
    <article
      className={`group flex items-start gap-2 border-b border-primary-100 last:border-b-0 dark:border-gray-800 ${
        isUnread ? 'bg-primary-50/70 dark:bg-primary-950/20' : 'bg-white dark:bg-gray-900'
      }`}
    >
      <button
        ref={actionRef}
        type="button"
        className={`flex min-w-0 flex-1 items-start gap-3 p-3 text-left transition-colors hover:bg-primary-100/70 focus:bg-primary-100/70 dark:hover:bg-gray-800 dark:focus:bg-gray-800 ${
          compact ? 'sm:p-3' : 'sm:p-4'
        } focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500`}
        onClick={() => onActivate?.(notification)}
        disabled={!onActivate || isBusy}
        aria-busy={readLoading || undefined}
      >
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon name={icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-sm font-semibold text-primary-950 dark:text-gray-100 break-words">
              {title}
            </span>
            {isUnread && (
              <span className="shrink-0 rounded-full border border-primary-300 bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:border-primary-700 dark:bg-primary-900/50 dark:text-primary-200">
                {t('notifications.unread')}
              </span>
            )}
          </span>
          <span className="mt-1 block break-words text-sm leading-5 text-primary-600 dark:text-gray-300">
            {message}
          </span>
          <span className="mt-2 block text-xs font-medium text-primary-500 dark:text-gray-400">
            {timestamp}
          </span>
        </span>
      </button>
      {onDelete && (
        <div className="shrink-0 pr-2 pt-2 sm:pr-3 sm:pt-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-primary-400 hover:text-danger-600 dark:text-gray-500 dark:hover:text-danger-400"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(notification);
            }}
            loading={deleteLoading}
            disabled={readLoading}
            aria-label={t('notifications.deleteNotification', { title })}
            title={t('notifications.delete')}
          >
            <Icon name="trash" className="size-4" />
          </Button>
        </div>
      )}
      <span className="sr-only">{isUnread ? t('notifications.unread') : t('notifications.read')}</span>
    </article>
  );
}
