'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const notificationService = require('../services/notificationService');
const apiRoutes = require('../routes/apiRoutes');
const {
  apiDeleteNotification,
  apiGetNotificationPreferences,
  apiListNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  apiUnreadNotificationCount,
  apiUpdateNotificationPreferences,
} = require('./notificationController');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createRequest(overrides = {}) {
  return {
    params: { notificationId: '99' },
    query: {},
    body: {},
    user: { id: 5, role: 'student' },
    ...overrides,
  };
}

function preserve(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}

test('notification list validates bounded query parameters before service work', async () => {
  const originals = preserve(notificationService, ['listNotifications']);
  let calls = 0;
  notificationService.listNotifications = async () => { calls += 1; };

  try {
    const invalidSize = createResponse();
    await apiListNotifications(createRequest({ query: { size: '101' } }), invalidSize);
    assert.equal(invalidSize.statusCode, 400);
    assert.match(invalidSize.body.error, /size must be a positive integer/i);

    const invalidType = createResponse();
    await apiListNotifications(createRequest({ query: { type: 'untrusted' } }), invalidType);
    assert.equal(invalidType.statusCode, 400);
    assert.match(invalidType.body.error, /Unsupported notification type/i);

    const unknownQuery = createResponse();
    await apiListNotifications(createRequest({ query: { user_id: '6' } }), unknownQuery);
    assert.equal(unknownQuery.statusCode, 400);
    assert.equal(calls, 0);
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('notification list resolves identity from authentication state and returns normalized output', async () => {
  const originals = preserve(notificationService, ['listNotifications']);
  let received;
  notificationService.listNotifications = async (...args) => {
    received = args;
    return { notifications: [], total: 0, page: 1, size: 20, totalPages: 0 };
  };

  try {
    const res = createResponse();
    await apiListNotifications(createRequest({
      query: { status: 'unread' },
      body: { user_id: 999 },
    }), res);

    assert.deepEqual(received, [5, { page: 1, size: 20, status: 'unread', type: undefined }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { notifications: [], total: 0, page: 1, size: 20, totalPages: 0 });
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('notification unread count and mark-all handlers use only the authenticated user', async () => {
  const originals = preserve(notificationService, [
    'countUnreadNotifications',
    'markAllNotificationsAsRead',
  ]);
  let countUserId;
  let markAllUserId;
  notificationService.countUnreadNotifications = async (userId) => {
    countUserId = userId;
    return 3;
  };
  notificationService.markAllNotificationsAsRead = async (userId) => {
    markAllUserId = userId;
    return 3;
  };

  try {
    const countResponse = createResponse();
    await apiUnreadNotificationCount(createRequest(), countResponse);
    assert.equal(countUserId, 5);
    assert.deepEqual(countResponse.body, { unreadCount: 3 });

    const markAllResponse = createResponse();
    await apiMarkAllNotificationsRead(createRequest({ body: { user_id: 999 } }), markAllResponse);
    assert.equal(markAllUserId, 5);
    assert.deepEqual(markAllResponse.body, { updatedCount: 3 });
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('marking one notification read returns the same 404 for another user or a missing notification', async () => {
  const originals = preserve(notificationService, ['markNotificationAsRead']);
  let received;
  notificationService.markNotificationAsRead = async (...args) => {
    received = args;
    return null;
  };

  try {
    const res = createResponse();
    await apiMarkNotificationRead(createRequest(), res);

    assert.deepEqual(received, [99, 5]);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Notification not found.' });
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('marking one owned notification read validates IDs and returns the service result', async () => {
  const originals = preserve(notificationService, ['markNotificationAsRead']);
  notificationService.markNotificationAsRead = async () => ({ id: 99, isRead: true });

  try {
    const success = createResponse();
    await apiMarkNotificationRead(createRequest(), success);
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.body, { notification: { id: 99, isRead: true } });

    const invalid = createResponse();
    await apiMarkNotificationRead(createRequest({ params: { notificationId: '99oops' } }), invalid);
    assert.equal(invalid.statusCode, 400);
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('notification deletion is ownership-bound and does not disclose unavailable resources', async () => {
  const originals = preserve(notificationService, ['deleteNotificationForUser']);
  let received;
  notificationService.deleteNotificationForUser = async (...args) => {
    received = args;
    return false;
  };

  try {
    const missing = createResponse();
    await apiDeleteNotification(createRequest(), missing);
    assert.deepEqual(received, [99, 5]);
    assert.equal(missing.statusCode, 404);

    notificationService.deleteNotificationForUser = async () => true;
    const deleted = createResponse();
    await apiDeleteNotification(createRequest(), deleted);
    assert.equal(deleted.statusCode, 200);
    assert.deepEqual(deleted.body, {
      message: 'Notification deleted successfully.',
      notificationId: 99,
    });
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('notification preference updates accept only known boolean fields', async () => {
  const originals = preserve(notificationService, ['updateNotificationPreferences']);
  let received;
  notificationService.updateNotificationPreferences = async (...args) => {
    received = args;
    return { goalReminders: false, checkinReminders: true, teacherFeedback: true, riskAlerts: true };
  };

  try {
    const unknown = createResponse();
    await apiUpdateNotificationPreferences(createRequest({ body: { email_alerts: true } }), unknown);
    assert.equal(unknown.statusCode, 400);
    assert.match(unknown.body.error, /not a notification preference/i);

    const nonBoolean = createResponse();
    await apiUpdateNotificationPreferences(createRequest({ body: { risk_alerts: 'true' } }), nonBoolean);
    assert.equal(nonBoolean.statusCode, 400);

    const success = createResponse();
    await apiUpdateNotificationPreferences(createRequest({ body: { goal_reminders: false } }), success);
    assert.deepEqual(received, [5, { goal_reminders: false }]);
    assert.equal(success.statusCode, 200);
    assert.equal(success.body.preferences.goalReminders, false);
  } finally {
    Object.assign(notificationService, originals);
  }
});

test('notification preference and list database failures return safe error responses', async () => {
  const originals = preserve(notificationService, [
    'getNotificationPreferences',
    'listNotifications',
  ]);
  const originalConsoleError = console.error;
  notificationService.getNotificationPreferences = async () => {
    throw new Error('SQL password and host details');
  };
  notificationService.listNotifications = async () => {
    throw new Error('SQL password and host details');
  };
  console.error = () => {};

  try {
    const preferenceResponse = createResponse();
    await apiGetNotificationPreferences(createRequest(), preferenceResponse);
    assert.equal(preferenceResponse.statusCode, 500);
    assert.deepEqual(preferenceResponse.body, { error: 'Failed to load notification preferences.' });

    const listResponse = createResponse();
    await apiListNotifications(createRequest(), listResponse);
    assert.equal(listResponse.statusCode, 500);
    assert.deepEqual(listResponse.body, { error: 'Failed to load notifications.' });
  } finally {
    Object.assign(notificationService, originals);
    console.error = originalConsoleError;
  }
});

function requestWithoutCredentials(path) {
  const app = express();
  app.use('/api', apiRoutes);
  const server = app.listen(0);

  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method: 'GET',
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        server.close((closeError) => {
          if (closeError) reject(closeError);
          else resolve({ statusCode: response.statusCode, body: JSON.parse(body) });
        });
      });
    });
    request.on('error', (error) => {
      server.close(() => reject(error));
    });
    request.end();
  });
}

test('notification routes reject unauthenticated requests before database access', async () => {
  const response = await requestWithoutCredentials('/api/notifications');
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    error: 'Authentication required',
    code: 'UNAUTHENTICATED',
  });
});
