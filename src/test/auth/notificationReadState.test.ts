import { describe, expect, it } from 'vitest';
import {
  findUnreadNotificationIdsForTask,
  markAllNotificationsAsRead,
  markNotificationsAsReadByIds,
  removeNotificationsByIds,
} from '@/features/auth/lib/notificationReadState';

describe('markAllNotificationsAsRead', () => {
  it('marks only unread notifications and preserves already-read entries', () => {
    const readAt = '2026-03-06T08:00:00.000Z';
    const notifications = [
      { id: 'n1', readAt: null, title: 'Unread' },
      { id: 'n2', readAt: '2026-03-05T11:20:00.000Z', title: 'Read' },
    ];

    const result = markAllNotificationsAsRead(notifications, readAt);

    expect(result).toEqual([
      { id: 'n1', readAt, title: 'Unread' },
      { id: 'n2', readAt: '2026-03-05T11:20:00.000Z', title: 'Read' },
    ]);
  });

  it('returns the same shape for empty collections', () => {
    expect(markAllNotificationsAsRead([], '2026-03-06T08:00:00.000Z')).toEqual([]);
  });

  it('removes only the notifications included in the provided id set', () => {
    const notifications = [
      { id: 'n1', readAt: null, title: 'Unread' },
      { id: 'n2', readAt: '2026-03-05T11:20:00.000Z', title: 'Read' },
      { id: 'n3', readAt: null, title: 'Other unread' },
    ];

    expect(removeNotificationsByIds(notifications, ['n1', 'n3'])).toEqual([
      { id: 'n2', readAt: '2026-03-05T11:20:00.000Z', title: 'Read' },
    ]);
  });

  it('returns the original collection when there is nothing to remove', () => {
    const notifications = [{ id: 'n1', readAt: null, title: 'Unread' }];
    expect(removeNotificationsByIds(notifications, [])).toEqual(notifications);
  });
});

describe('reading the notifications of one task', () => {
  const readAt = '2026-10-13T12:00:00.000Z';
  const notifications = [
    { id: 'n1', taskId: 'task-1', readAt: null },
    { id: 'n2', taskId: 'task-1', readAt: '2026-10-12T09:00:00.000Z' },
    { id: 'n3', taskId: 'task-2', readAt: null },
    { id: 'n4', taskId: null, readAt: null },
    { id: 'n5', taskId: 'task-1', readAt: null },
  ];

  it('finds only the unread notifications of that task', () => {
    expect(findUnreadNotificationIdsForTask(notifications, 'task-1')).toEqual(['n1', 'n5']);
    expect(findUnreadNotificationIdsForTask(notifications, 'task-3')).toEqual([]);
  });

  it('finds nothing when no task is open', () => {
    expect(findUnreadNotificationIdsForTask(notifications, null)).toEqual([]);
  });

  it('marks just the given ids and keeps an earlier read time', () => {
    const result = markNotificationsAsReadByIds(notifications, ['n1', 'n2'], readAt);
    expect(result.map((notification) => notification.readAt)).toEqual([
      readAt,
      '2026-10-12T09:00:00.000Z',
      null,
      null,
      null,
    ]);
  });

  it('returns the original collection when there is nothing to mark', () => {
    expect(markNotificationsAsReadByIds(notifications, [], readAt)).toBe(notifications);
  });
});
