import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import { useAuth } from './useAuth';
import {
  buildNotificationQuery,
  buildPreferencePayload,
  normalizeNotificationListOptions,
  normalizeNotificationPage,
  toPositiveSafeInteger,
} from '../utils/notifications';

const NotificationContext = createContext(null);
const RECENT_LIST_OPTIONS = Object.freeze({ page: 1, size: 5, status: 'all' });
const POLL_INTERVAL_MS = 60_000;

function emptyPage() {
  return {
    notifications: [],
    total: 0,
    page: 1,
    size: RECENT_LIST_OPTIONS.size,
    totalPages: 0,
  };
}

function normalizeUnreadCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const userId = toPositiveSafeInteger(user?.id);
  const sessionKey = userId === null ? null : `${userId}:${user?.role || ''}`;
  const currentSessionRef = useRef(sessionKey);
  const initializedSessionRef = useRef(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(new Map());
  currentSessionRef.current = sessionKey;

  const [unreadCount, setUnreadCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [countError, setCountError] = useState('');
  const [recentPage, setRecentPage] = useState(emptyPage);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState('');
  const [preferences, setPreferences] = useState(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [mutationKeys, setMutationKeys] = useState([]);

  const isCurrentSession = useCallback((requestSession) => mountedRef.current
    && requestSession !== null
    && requestSession === currentSessionRef.current, []);

  const runRequest = useCallback((key, work) => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return Promise.resolve(null);

    const requestKey = `${requestSession}:${key}`;
    const existing = inFlightRef.current.get(requestKey);
    if (existing) return existing;

    const request = Promise.resolve()
      .then(work)
      .finally(() => {
        if (inFlightRef.current.get(requestKey) === request) {
          inFlightRef.current.delete(requestKey);
        }
      });
    inFlightRef.current.set(requestKey, request);
    return request;
  }, []);

  const setMutationActive = useCallback((key, active, requestSession = currentSessionRef.current) => {
    if (!isCurrentSession(requestSession)) return;
    setMutationKeys((current) => {
      const remaining = current.filter((entry) => entry !== key);
      return active ? [...remaining, key] : remaining;
    });
  }, [isCurrentSession]);

  const refreshUnreadCount = useCallback(async ({ background = false } = {}) => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return 0;

    if (!background && isCurrentSession(requestSession)) {
      setCountLoading(true);
      setCountError('');
    }

    try {
      const response = await runRequest('unread-count', () => api.get('/notifications/unread-count'));
      const nextCount = normalizeUnreadCount(response?.unreadCount);
      if (isCurrentSession(requestSession)) {
        setUnreadCount(nextCount);
        if (!background) setCountError('');
      }
      return nextCount;
    } catch (error) {
      if (isCurrentSession(requestSession) && !background) {
        setCountError(error?.message || '');
      }
      throw error;
    } finally {
      if (isCurrentSession(requestSession) && !background) setCountLoading(false);
    }
  }, [isCurrentSession, runRequest]);

  const fetchNotifications = useCallback(async (options = {}) => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return emptyPage();

    const normalized = normalizeNotificationListOptions(options);
    const query = buildNotificationQuery(normalized);
    const response = await runRequest(`notifications:${query}`, () => api.get(`/notifications?${query}`));
    return normalizeNotificationPage(response, normalized);
  }, [runRequest]);

  const refreshRecent = useCallback(async () => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return emptyPage();

    if (isCurrentSession(requestSession)) {
      setRecentLoading(true);
      setRecentError('');
    }
    try {
      const result = await fetchNotifications(RECENT_LIST_OPTIONS);
      if (isCurrentSession(requestSession)) {
        setRecentPage(result);
        setRecentError('');
      }
      return result;
    } catch (error) {
      if (isCurrentSession(requestSession)) setRecentError(error?.message || '');
      throw error;
    } finally {
      if (isCurrentSession(requestSession)) setRecentLoading(false);
    }
  }, [fetchNotifications, isCurrentSession]);

  const loadPreferences = useCallback(async ({ force = false } = {}) => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return null;
    if (!force && preferences) return preferences;

    if (isCurrentSession(requestSession)) {
      setPreferencesLoading(true);
      setPreferencesError('');
    }
    try {
      const response = await runRequest('preferences', () => api.get('/notifications/preferences'));
      const nextPreferences = response?.preferences && typeof response.preferences === 'object' && !Array.isArray(response.preferences)
        ? response.preferences
        : null;
      if (isCurrentSession(requestSession)) {
        setPreferences(nextPreferences);
        setPreferencesError('');
      }
      return nextPreferences;
    } catch (error) {
      if (isCurrentSession(requestSession)) setPreferencesError(error?.message || '');
      throw error;
    } finally {
      if (isCurrentSession(requestSession)) setPreferencesLoading(false);
    }
  }, [isCurrentSession, preferences, runRequest]);

  const updateRecentNotification = useCallback((notification, requestSession) => {
    if (!notification || !isCurrentSession(requestSession)) return;
    const id = toPositiveSafeInteger(notification.id);
    if (id === null) return;

    setRecentPage((current) => ({
      ...current,
      notifications: current.notifications.map((item) => (
        toPositiveSafeInteger(item?.id) === id ? notification : item
      )),
    }));
  }, [isCurrentSession]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const id = toPositiveSafeInteger(notificationId);
    const requestSession = currentSessionRef.current;
    if (id === null || !requestSession) return null;

    const key = `read:${id}`;
    setMutationActive(key, true, requestSession);
    try {
      const response = await runRequest(`read:${id}`, () => api.put(`/notifications/${id}/read`, {}));
      const notification = response?.notification || null;
      updateRecentNotification(notification, requestSession);
      await refreshUnreadCount({ background: true }).catch(() => null);
      return notification;
    } finally {
      setMutationActive(key, false, requestSession);
    }
  }, [refreshUnreadCount, runRequest, setMutationActive, updateRecentNotification]);

  const markAllNotificationsRead = useCallback(async () => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return 0;

    const key = 'read-all';
    setMutationActive(key, true, requestSession);
    try {
      const response = await runRequest('read-all', () => api.put('/notifications/read-all', {}));
      await Promise.all([
        refreshUnreadCount({ background: true }).catch(() => null),
        refreshRecent().catch(() => null),
      ]);
      return normalizeUnreadCount(response?.updatedCount);
    } finally {
      setMutationActive(key, false, requestSession);
    }
  }, [refreshRecent, refreshUnreadCount, runRequest, setMutationActive]);

  const deleteNotification = useCallback(async (notificationId) => {
    const id = toPositiveSafeInteger(notificationId);
    const requestSession = currentSessionRef.current;
    if (id === null || !requestSession) return false;

    const key = `delete:${id}`;
    setMutationActive(key, true, requestSession);
    try {
      await runRequest(`delete:${id}`, () => api.delete(`/notifications/${id}`));
      if (isCurrentSession(requestSession)) {
        setRecentPage((current) => ({
          ...current,
          notifications: current.notifications.filter((item) => toPositiveSafeInteger(item?.id) !== id),
        }));
      }
      await refreshUnreadCount({ background: true }).catch(() => null);
      return true;
    } finally {
      setMutationActive(key, false, requestSession);
    }
  }, [isCurrentSession, refreshUnreadCount, runRequest, setMutationActive]);

  const updatePreferences = useCallback(async (nextPreferences) => {
    const requestSession = currentSessionRef.current;
    if (!requestSession) return null;

    const key = 'preferences';
    setMutationActive(key, true, requestSession);
    if (isCurrentSession(requestSession)) setPreferencesError('');
    const payload = buildPreferencePayload(nextPreferences);
    try {
      const response = await runRequest('preferences:update', () => api.put('/notifications/preferences', payload));
      const nextPreferences = response?.preferences && typeof response.preferences === 'object' && !Array.isArray(response.preferences)
        ? response.preferences
        : null;
      if (isCurrentSession(requestSession)) setPreferences(nextPreferences);
      return nextPreferences;
    } catch (error) {
      if (isCurrentSession(requestSession)) setPreferencesError(error?.message || '');
      throw error;
    } finally {
      setMutationActive(key, false, requestSession);
    }
  }, [isCurrentSession, runRequest, setMutationActive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const isNewSession = initializedSessionRef.current !== sessionKey;
    if (isNewSession) {
      initializedSessionRef.current = sessionKey;
      inFlightRef.current.clear();
      setUnreadCount(0);
      setCountLoading(Boolean(sessionKey));
      setCountError('');
      setRecentPage(emptyPage());
      setRecentLoading(false);
      setRecentError('');
      setPreferences(null);
      setPreferencesLoading(false);
      setPreferencesError('');
      setMutationKeys([]);
    }

    if (!sessionKey) return undefined;

    refreshUnreadCount().catch(() => null);
    const refreshForVisiblePage = () => {
      if (document.visibilityState === 'visible') {
        refreshUnreadCount({ background: true }).catch(() => null);
      }
    };
    const intervalId = window.setInterval(refreshForVisiblePage, POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshForVisiblePage);
    document.addEventListener('visibilitychange', refreshForVisiblePage);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshForVisiblePage);
      document.removeEventListener('visibilitychange', refreshForVisiblePage);
    };
  }, [refreshUnreadCount, sessionKey]);

  const value = useMemo(() => ({
    unreadCount,
    countLoading,
    countError,
    recentNotifications: recentPage.notifications,
    recentLoading,
    recentError,
    preferences,
    preferencesLoading,
    preferencesError,
    pollingIntervalMs: POLL_INTERVAL_MS,
    refreshUnreadCount,
    fetchNotifications,
    refreshRecent,
    loadPreferences,
    updatePreferences,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    isMutating: (key) => mutationKeys.includes(key),
  }), [
    countError,
    countLoading,
    deleteNotification,
    fetchNotifications,
    loadPreferences,
    markAllNotificationsRead,
    markNotificationRead,
    mutationKeys,
    preferences,
    preferencesError,
    preferencesLoading,
    recentError,
    recentLoading,
    recentPage.notifications,
    refreshRecent,
    refreshUnreadCount,
    unreadCount,
    updatePreferences,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
