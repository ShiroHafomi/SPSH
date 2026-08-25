import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from './ui';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useNotifications } from '../hooks/useNotifications';
import {
  formatUnreadCount,
  notificationRouteForRole,
  resolveNotificationDestination,
} from '../utils/notifications';
import { NotificationItem } from './NotificationItem';

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    unreadCount,
    countLoading,
    countError,
    recentNotifications,
    recentLoading,
    recentError,
    refreshRecent,
    refreshUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    isMutating,
  } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const unreadLabel = formatUnreadCount(unreadCount);
  const markingAllRead = isMutating('read-all');

  const closePopover = useCallback(({ restoreFocus = true } = {}) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openPopover = async () => {
    setActionError('');
    setIsOpen(true);
    try {
      await refreshRecent();
    } catch {
      // The provider exposes a localized, retryable UI state.
    }
  };

  const togglePopover = () => {
    if (isOpen) {
      closePopover();
    } else {
      openPopover();
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) closePopover();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePopover();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePopover, isOpen]);

  const moveItemFocus = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = itemRefs.current.filter(Boolean);
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex === -1
      ? (offset === 1 ? 0 : items.length - 1)
      : (currentIndex + offset + items.length) % items.length;
    event.preventDefault();
    items[nextIndex].focus();
  };

  const handleItemActivate = async (notification) => {
    setActionError('');
    try {
      await markNotificationRead(notification?.id);
      closePopover({ restoreFocus: false });
      navigate(resolveNotificationDestination(notification, user?.role));
    } catch {
      setActionError(t('notifications.actionError'));
    }
  };

  const handleMarkAllRead = async () => {
    setActionError('');
    try {
      await markAllNotificationsRead();
    } catch {
      setActionError(t('notifications.actionError'));
    }
  };

  const handleViewAll = () => {
    closePopover({ restoreFocus: false });
    navigate(notificationRouteForRole(user?.role));
  };

  const retryRecent = () => {
    setActionError('');
    refreshRecent().catch(() => null);
  };

  const retryCount = () => {
    setActionError('');
    refreshUnreadCount().catch(() => null);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="relative shrink-0 rounded-xl"
        onClick={togglePopover}
        aria-label={t('notifications.bellLabel', { count: unreadCount })}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={t('notifications.title')}
      >
        <Icon name="bell" className="size-5" />
        {unreadLabel && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-danger-600 px-1 text-[10px] font-bold leading-4 text-white dark:border-gray-900">
            {unreadLabel}
          </span>
        )}
      </Button>

      {isOpen && (
        <section
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-clay-md dark:border-gray-800 dark:bg-gray-900"
          role="dialog"
          aria-label={t('notifications.title')}
          onKeyDown={moveItemFocus}
        >
          <header className="flex items-center justify-between gap-3 border-b border-primary-100 px-4 py-3 dark:border-gray-800">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-primary-950 dark:text-gray-100">
                {t('notifications.title')}
              </h2>
              <p className="text-xs text-primary-500 dark:text-gray-400">
                {t('notifications.pollingNotice')}
              </p>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={handleMarkAllRead}
                loading={markingAllRead}
              >
                {t('notifications.markAllRead')}
              </Button>
            )}
          </header>

          {(actionError || (countError && !countLoading)) && (
            <div className="m-3 flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-900/50 dark:bg-danger-950/30 dark:text-danger-300" role="alert">
              <span>{actionError || t('notifications.countError')}</span>
              {!actionError && (
                <Button variant="ghost" size="sm" onClick={retryCount}>
                  {t('notifications.retry')}
                </Button>
              )}
            </div>
          )}

          <div className="max-h-[min(26rem,calc(100vh-14rem))] overflow-y-auto">
            {recentLoading && recentNotifications.length === 0 && (
              <p className="p-5 text-sm text-primary-600 dark:text-gray-300" role="status">
                {t('notifications.loading')}
              </p>
            )}

            {!recentLoading && recentError && (
              <div className="p-5 text-center">
                <p className="text-sm text-danger-700 dark:text-danger-300" role="alert">
                  {t('notifications.loadError')}
                </p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={retryRecent}>
                  {t('notifications.retry')}
                </Button>
              </div>
            )}

            {!recentLoading && !recentError && recentNotifications.length === 0 && (
              <p className="p-5 text-sm text-primary-600 dark:text-gray-300">
                {t('notifications.empty')}
              </p>
            )}

            {recentNotifications.map((notification, index) => (
              <NotificationItem
                key={notification?.id || `recent-${index}`}
                notification={notification}
                compact
                onActivate={handleItemActivate}
                actionRef={(element) => {
                  itemRefs.current[index] = element;
                }}
                readLoading={isMutating(`read:${notification?.id}`)}
              />
            ))}
          </div>

          <footer className="border-t border-primary-100 p-3 dark:border-gray-800">
            <Button variant="secondary" size="sm" fullWidth onClick={handleViewAll}>
              {t('notifications.viewAll')}
            </Button>
          </footer>
        </section>
      )}
    </div>
  );
}
