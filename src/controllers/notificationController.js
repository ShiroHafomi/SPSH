'use strict';

/**
 * Notification Controller — authenticated, ownership-safe JSON handlers for
 * in-app notifications and per-user notification preferences.
 */
const notificationService = require('../services/notificationService');
const { parsePositiveSafeInteger } = require('../utils/inputValidation');

const LIST_QUERY_FIELDS = new Set(['page', 'size', 'status', 'type']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseNotificationId(value) {
  const notificationId = parsePositiveSafeInteger(value);
  if (notificationId === null) {
    return { error: 'Notification ID must be a positive integer.' };
  }
  return { notificationId };
}

function parseListQuery(query) {
  if (!isPlainObject(query)) return { error: 'Notification query must be an object.' };

  for (const key of Object.keys(query)) {
    if (!LIST_QUERY_FIELDS.has(key)) {
      return { error: `Unsupported notification query parameter: ${key}.` };
    }
  }

  try {
    return {
      options: notificationService.normalizeListOptions({
        page: query.page === '' ? undefined : query.page,
        size: query.size === '' ? undefined : query.size,
        status: query.status === '' ? undefined : query.status,
        type: query.type === '' ? undefined : query.type,
      }),
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * GET /api/notifications
 */
async function apiListNotifications(req, res) {
  const parsedQuery = parseListQuery(req.query || {});
  if (parsedQuery.error) return res.status(400).json({ error: parsedQuery.error });

  try {
    const result = await notificationService.listNotifications(req.user.id, parsedQuery.options);
    return res.json(result);
  } catch (err) {
    console.error('[apiListNotifications]', err);
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
}

/**
 * GET /api/notifications/unread-count
 */
async function apiUnreadNotificationCount(req, res) {
  try {
    const unreadCount = await notificationService.countUnreadNotifications(req.user.id);
    return res.json({ unreadCount });
  } catch (err) {
    console.error('[apiUnreadNotificationCount]', err);
    return res.status(500).json({ error: 'Failed to load unread notification count.' });
  }
}

/**
 * PUT /api/notifications/:notificationId/read
 */
async function apiMarkNotificationRead(req, res) {
  const parsedId = parseNotificationId(req.params.notificationId);
  if (parsedId.error) return res.status(400).json({ error: parsedId.error });

  try {
    const notification = await notificationService.markNotificationAsRead(
      parsedId.notificationId,
      req.user.id
    );
    if (!notification) {
      // Do not reveal whether another user owns the requested notification.
      return res.status(404).json({ error: 'Notification not found.' });
    }
    return res.json({ notification });
  } catch (err) {
    console.error('[apiMarkNotificationRead]', err);
    return res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
}

/**
 * PUT /api/notifications/read-all
 */
async function apiMarkAllNotificationsRead(req, res) {
  try {
    const updatedCount = await notificationService.markAllNotificationsAsRead(req.user.id);
    return res.json({ updatedCount });
  } catch (err) {
    console.error('[apiMarkAllNotificationsRead]', err);
    return res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
}

/**
 * DELETE /api/notifications/:notificationId
 */
async function apiDeleteNotification(req, res) {
  const parsedId = parseNotificationId(req.params.notificationId);
  if (parsedId.error) return res.status(400).json({ error: parsedId.error });

  try {
    const deleted = await notificationService.deleteNotificationForUser(
      parsedId.notificationId,
      req.user.id
    );
    if (!deleted) {
      // Do not reveal whether another user owns the requested notification.
      return res.status(404).json({ error: 'Notification not found.' });
    }
    return res.json({
      message: 'Notification deleted successfully.',
      notificationId: parsedId.notificationId,
    });
  } catch (err) {
    console.error('[apiDeleteNotification]', err);
    return res.status(500).json({ error: 'Failed to delete notification.' });
  }
}

/**
 * GET /api/notifications/preferences
 */
async function apiGetNotificationPreferences(req, res) {
  try {
    const preferences = await notificationService.getNotificationPreferences(req.user.id);
    return res.json({ preferences });
  } catch (err) {
    console.error('[apiGetNotificationPreferences]', err);
    return res.status(500).json({ error: 'Failed to load notification preferences.' });
  }
}

/**
 * PUT /api/notifications/preferences
 */
async function apiUpdateNotificationPreferences(req, res) {
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Notification preferences must be an object.' });
  }

  let updates;
  try {
    updates = notificationService.normalizePreferenceUpdates(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const preferences = await notificationService.updateNotificationPreferences(req.user.id, updates);
    return res.json({ preferences });
  } catch (err) {
    console.error('[apiUpdateNotificationPreferences]', err);
    return res.status(500).json({ error: 'Failed to update notification preferences.' });
  }
}

module.exports = {
  apiDeleteNotification,
  apiGetNotificationPreferences,
  apiListNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  apiUnreadNotificationCount,
  apiUpdateNotificationPreferences,
  parseListQuery,
};
