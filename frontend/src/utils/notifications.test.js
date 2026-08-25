import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotificationQuery,
  buildPreferencePayload,
  formatNotificationDate,
  formatNotificationDateTime,
  formatUnreadCount,
  getNotificationPresentation,
  normalizeNotificationListOptions,
  normalizeNotificationPage,
  resolveNotificationDestination,
} from './notifications.js';

const deadlineNotification = {
  id: 1,
  type: 'goal_deadline',
  titleKey: 'notifications.goalDeadline.title',
  messageKey: 'notifications.goalDeadline.message',
  metadata: { goalId: 9, deadline: '2026-08-26' },
  isRead: false,
  createdAt: '2026-08-25T12:00:00.000Z',
};

test('formats unread counts without exposing invalid numeric values', () => {
  assert.equal(formatUnreadCount(0), '');
  assert.equal(formatUnreadCount(1), '1');
  assert.equal(formatUnreadCount(99), '99');
  assert.equal(formatUnreadCount(100), '99+');
  assert.equal(formatUnreadCount('7'), '7');
  assert.equal(formatUnreadCount(Infinity), '');
  assert.equal(formatUnreadCount('7.5'), '');
});

test('accepts only known type and matching backend localization keys', () => {
  assert.deepEqual(getNotificationPresentation(deadlineNotification), {
    type: 'goal_deadline',
    titleKey: 'notifications.goalDeadline.title',
    messageKey: 'notifications.goalDeadline.message',
    icon: 'calendar',
    tone: 'warning',
  });
  assert.equal(getNotificationPresentation({ ...deadlineNotification, messageKey: 'untrusted.key' }), null);
  assert.equal(getNotificationPresentation({ ...deadlineNotification, type: 'unknown' }), null);
});

test('formats valid dates and suppresses invalid notification timestamps', () => {
  assert.notEqual(formatNotificationDate('2026-08-26', 'en'), '');
  assert.notEqual(formatNotificationDate('2026-08-26', 'vi'), '');
  assert.equal(formatNotificationDate('2026-02-30'), '');
  assert.notEqual(formatNotificationDateTime('2026-08-25T12:00:00.000Z'), '');
  assert.equal(formatNotificationDateTime('not a date'), '');
  assert.equal(formatNotificationDateTime(Infinity), '');
});

test('routes students to goals and staff only to allowlisted goal paths', () => {
  assert.equal(resolveNotificationDestination(deadlineNotification, 'student'), '/goals');
  assert.equal(resolveNotificationDestination(deadlineNotification, 'teacher'), '/notifications');
  assert.equal(resolveNotificationDestination({
    ...deadlineNotification,
    metadata: { goalId: 9, studentId: 42, destination: 'https://attacker.example' },
  }, 'teacher'), '/teacher/students/42/goals');
  assert.equal(resolveNotificationDestination({
    ...deadlineNotification,
    metadata: { goalId: 9, studentId: '42/../../admin' },
  }, 'admin'), '/notifications');
  assert.equal(resolveNotificationDestination({ ...deadlineNotification, type: 'unknown' }, 'student'), '/notifications');
});

test('normalizes filters and sends only backend-supported query values', () => {
  assert.deepEqual(normalizeNotificationListOptions({ page: '0', size: 200, status: 'invalid', type: 'bad' }), {
    page: 1,
    size: 100,
    status: 'all',
    type: undefined,
  });
  assert.equal(buildNotificationQuery({ page: 2, size: 20, status: 'all' }), 'page=2&size=20');
  assert.equal(
    buildNotificationQuery({ page: 3, size: 15, status: 'unread', type: 'teacher_feedback' }),
    'page=3&size=15&status=unread&type=teacher_feedback'
  );
});

test('normalizes pagination results without invalid page or count values', () => {
  assert.deepEqual(normalizeNotificationPage({
    notifications: null,
    total: 'not-a-number',
    page: Infinity,
    size: 0,
    totalPages: -1,
  }, { page: 4, size: 25 }), {
    notifications: [],
    total: 0,
    page: 1,
    size: 25,
    totalPages: 0,
  });
});

test('allowlists exactly the documented preference payload fields', () => {
  assert.deepEqual(buildPreferencePayload({
    goalReminders: false,
    checkinReminders: true,
    teacherFeedback: true,
    riskAlerts: false,
    emailAlerts: true,
    arbitrary: false,
  }), {
    goal_reminders: false,
    checkin_reminders: true,
    teacher_feedback: true,
    risk_alerts: false,
  });
  assert.deepEqual(buildPreferencePayload({ goalReminders: 'false' }), {});
});
