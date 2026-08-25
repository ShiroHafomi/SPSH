'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../config/db');
const notificationService = require('./notificationService');

const originalPoolQuery = pool.query;

test.afterEach(() => {
  pool.query = originalPoolQuery;
});

test('notification schema initialization creates ownership, indexes, and idempotency constraints', async () => {
  const statements = [];
  pool.query = async (sql) => {
    statements.push(sql);
    return [{}];
  };

  await notificationService.ensureNotificationTables();

  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS notifications/i);
  assert.match(statements[0], /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/i);
  assert.match(statements[0], /INDEX idx_notifications_user_read \(user_id, is_read\)/i);
  assert.match(statements[0], /INDEX idx_notifications_user_created \(user_id, created_at\)/i);
  assert.match(statements[0], /UNIQUE KEY uk_notifications_user_dedupe \(user_id, dedupe_key\)/i);
  assert.match(statements[1], /CREATE TABLE IF NOT EXISTS notification_preferences/i);
  assert.match(statements[1], /user_id INT UNSIGNED PRIMARY KEY/i);
  assert.match(statements[1], /goal_reminders BOOLEAN NOT NULL DEFAULT TRUE/i);
});

test('notification creation validates the type, metadata, and parameterizes the insert', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [{ insertId: 31, affectedRows: 1 }];
  };

  const notification = await notificationService.createNotification({
    userId: 5,
    type: 'goal_deadline',
    metadata: { goalId: 8, deadline: '2026-09-01' },
  });

  assert.equal(notification.id, 31);
  assert.equal(notification.created, true);
  assert.equal(notification.titleKey, 'notifications.goalDeadline.title');
  assert.deepEqual(notification.metadata, { goalId: 8, deadline: '2026-09-01' });
  assert.match(notification.dedupeKey, /^goal_deadline:[a-f0-9]{64}$/);
  assert.match(call.sql, /INSERT INTO notifications/i);
  assert.match(call.sql, /ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID\(id\)/i);
  assert.deepEqual(call.params.slice(0, 5), [
    5,
    'goal_deadline',
    'notifications.goalDeadline.title',
    'notifications.goalDeadline.message',
    JSON.stringify({ goalId: 8, deadline: '2026-09-01' }),
  ]);
  assert.equal(call.params[5], notification.dedupeKey);
});

test('notification creation is idempotent for the same deterministic dedupe key', async () => {
  const calls = [];
  pool.query = async (_sql, params) => {
    calls.push(params);
    return [calls.length === 1
      ? { insertId: 31, affectedRows: 1 }
      : { insertId: 31, affectedRows: 0 }];
  };

  const first = await notificationService.createNotification({
    userId: 5,
    type: 'goal_completed',
    metadata: { goalId: 8 },
  });
  const duplicate = await notificationService.createNotification({
    userId: 5,
    type: 'goal_completed',
    metadata: { goalId: 8 },
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.id, duplicate.id);
  assert.equal(calls[0][5], calls[1][5]);
});

test('notification creation rejects unsupported types before querying MySQL', async () => {
  let calls = 0;
  pool.query = async () => { calls += 1; };

  await assert.rejects(
    () => notificationService.createNotification({ userId: 5, type: 'arbitrary_html', metadata: {} }),
    /Unsupported notification type/i
  );
  assert.equal(calls, 0);
});

test('metadata allows only safe navigation fields, enforces a size bound, and parses malformed rows safely', () => {
  assert.deepEqual(
    notificationService.validateMetadata({ goalId: '8', progressStatus: 'needs_attention' }),
    { goalId: 8, progressStatus: 'needs_attention' }
  );
  assert.throws(
    () => notificationService.validateMetadata({ teacherFeedback: 'private text' }),
    /not allowed/i
  );
  assert.throws(
    () => notificationService.validateMetadata({
      goalId: '9007199254740991',
      studentId: '9007199254740991',
      checkinId: '9007199254740991',
      progressStatus: 'needs_attention',
      deadline: '2026-09-01',
    }),
    /cannot exceed/i
  );
  assert.deepEqual(notificationService.parseStoredMetadata('{invalid json'), {});
  assert.deepEqual(
    notificationService.parseStoredMetadata('{"goalId":8,"password":"secret"}'),
    { goalId: 8 }
  );
});

test('notification lists bind user/filter values, paginate safely, and normalize malformed metadata', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/COUNT\(\*\)/i.test(sql)) return [[{ total: 26 }]];
    return [[{
      id: 8,
      type: 'teacher_feedback',
      title_key: 'notifications.teacherFeedback.title',
      message_key: 'notifications.teacherFeedback.message',
      metadata_json: '{invalid',
      is_read: 0,
      created_at: '2026-08-25 09:00:00',
      read_at: null,
    }]];
  };

  const result = await notificationService.listNotifications(5, {
    page: 2,
    size: 25,
    status: 'unread',
    type: 'teacher_feedback',
  });

  assert.equal(result.total, 26);
  assert.equal(result.totalPages, 2);
  assert.equal(result.notifications[0].isRead, false);
  assert.deepEqual(result.notifications[0].metadata, {});
  assert.match(calls[0].sql, /user_id = \? AND is_read = \? AND type = \?/i);
  assert.match(calls[0].sql, /ORDER BY created_at DESC, id DESC/i);
  assert.match(calls[0].sql, /LIMIT \? OFFSET \?/i);
  assert.deepEqual(calls[0].params, [5, 0, 'teacher_feedback', 25, 25]);
  assert.deepEqual(calls[1].params, [5, 0, 'teacher_feedback']);

  await assert.rejects(
    () => notificationService.listNotifications(5, { page: 1, size: 101 }),
    /size must be a positive integer/i
  );
});

test('unread counts bind the authenticated user ID', async () => {
  let call;
  pool.query = async (sql, params) => {
    call = { sql, params };
    return [[{ total: 3 }]];
  };

  assert.equal(await notificationService.countUnreadNotifications(5), 3);
  assert.match(call.sql, /WHERE user_id = \? AND is_read = \?/i);
  assert.deepEqual(call.params, [5, 0]);
});

test('marking a notification read binds ownership and hides another user notification', async () => {
  const calls = [];
  let lookupCount = 0;
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT id, type/i.test(sql)) {
      lookupCount += 1;
      if (lookupCount === 1) {
        return [[{
          id: 99,
          type: 'goal_completed',
          title_key: 'notifications.goalCompleted.title',
          message_key: 'notifications.goalCompleted.message',
          metadata_json: '{}',
          is_read: 0,
          created_at: '2026-08-25 09:00:00',
          read_at: null,
        }]];
      }
      return [[{
        id: 99,
        type: 'goal_completed',
        title_key: 'notifications.goalCompleted.title',
        message_key: 'notifications.goalCompleted.message',
        metadata_json: '{}',
        is_read: 1,
        created_at: '2026-08-25 09:00:00',
        read_at: '2026-08-25 09:01:00',
      }]];
    }
    return [{ affectedRows: 1 }];
  };

  const notification = await notificationService.markNotificationAsRead(99, 5);

  assert.equal(notification.isRead, true);
  assert.deepEqual(calls[0].params, [99, 5]);
  assert.match(calls[1].sql, /WHERE id = \? AND user_id = \? AND is_read = \?/i);
  assert.deepEqual(calls[1].params, [1, 99, 5, 0]);

  pool.query = async () => [[]];
  assert.equal(await notificationService.markNotificationAsRead(99, 6), null);
});

test('mark-all and delete operations bind the requesting user to mutations', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return [{ affectedRows: calls.length === 1 ? 4 : 1 }];
  };

  assert.equal(await notificationService.markAllNotificationsAsRead(5), 4);
  assert.equal(await notificationService.deleteNotificationForUser(99, 5), true);
  assert.match(calls[0].sql, /WHERE user_id = \? AND is_read = \?/i);
  assert.deepEqual(calls[0].params, [1, 5, 0]);
  assert.match(calls[1].sql, /DELETE FROM notifications WHERE id = \? AND user_id = \?/i);
  assert.deepEqual(calls[1].params, [99, 5]);
});

test('notification preferences initialize defaults, update known booleans, and reject unknown fields', async () => {
  const calls = [];
  let selectionCount = 0;
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT goal_reminders/i.test(sql)) {
      selectionCount += 1;
      return [[selectionCount === 1 ? {
        goal_reminders: 1,
        checkin_reminders: 1,
        teacher_feedback: 1,
        risk_alerts: 1,
        created_at: '2026-08-25 09:00:00',
        updated_at: '2026-08-25 09:00:00',
      } : {
        goal_reminders: 0,
        checkin_reminders: 1,
        teacher_feedback: 1,
        risk_alerts: 0,
        created_at: '2026-08-25 09:00:00',
        updated_at: '2026-08-25 09:01:00',
      }]];
    }
    return [{ affectedRows: 1 }];
  };

  const defaults = await notificationService.getNotificationPreferences(5);
  assert.deepEqual(
    {
      goalReminders: defaults.goalReminders,
      checkinReminders: defaults.checkinReminders,
      teacherFeedback: defaults.teacherFeedback,
      riskAlerts: defaults.riskAlerts,
    },
    { goalReminders: true, checkinReminders: true, teacherFeedback: true, riskAlerts: true }
  );
  assert.match(calls[0].sql, /INSERT INTO notification_preferences/i);
  assert.deepEqual(calls[0].params, [5]);

  calls.length = 0;
  const updated = await notificationService.updateNotificationPreferences(5, {
    goal_reminders: false,
    risk_alerts: false,
  });
  assert.equal(updated.goalReminders, false);
  assert.equal(updated.riskAlerts, false);
  assert.match(calls[1].sql, /SET goal_reminders = \?, risk_alerts = \?/i);
  assert.deepEqual(calls[1].params, [0, 0, 5]);

  await assert.rejects(
    () => notificationService.updateNotificationPreferences(5, { email_alerts: true }),
    /not a notification preference/i
  );
});

test('event identity metadata accepts safe versions and UTC Mondays only', () => {
  assert.deepEqual(
    notificationService.validateMetadata({
      goalId: '8',
      checkinId: '99',
      eventVersion: '2',
      reminderWeekStart: '2026-08-24',
    }),
    {
      goalId: 8,
      checkinId: 99,
      eventVersion: 2,
      reminderWeekStart: '2026-08-24',
    }
  );

  assert.throws(
    () => notificationService.validateMetadata({ reminderWeekStart: '2026-08-25' }),
    /UTC Monday/i
  );
  assert.throws(
    () => notificationService.validateMetadata({ eventVersion: 0 }),
    /positive integer/i
  );
});

test('event identity fields alter deterministic dedupe keys and stored metadata remains private', () => {
  const first = notificationService.buildDedupeKey('progress_attention', {
    goalId: 8,
    checkinId: 99,
    progressStatus: 'needs_attention',
    eventVersion: 1,
  });
  const revision = notificationService.buildDedupeKey('progress_attention', {
    goalId: 8,
    checkinId: 99,
    progressStatus: 'needs_attention',
    eventVersion: 2,
  });

  assert.notEqual(first, revision);
  assert.deepEqual(
    notificationService.parseStoredMetadata(JSON.stringify({
      goalId: 8,
      eventVersion: 2,
      reminderWeekStart: '2026-08-24',
      feedback: 'private text',
    })),
    { goalId: 8, eventVersion: 2, reminderWeekStart: '2026-08-24' }
  );
});
