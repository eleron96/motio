import { describe, expect, it } from 'vitest';
import {
  collectSeenTaskIds,
  findUnreadNotificationsForTasks,
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

  const idsOf = (items: Array<{ id: string }>) => items.map((item) => item.id);

  it('finds only the unread notifications of the seen tasks', () => {
    expect(idsOf(findUnreadNotificationsForTasks(notifications, new Set(['task-1'])))).toEqual(['n1', 'n5']);
    expect(idsOf(findUnreadNotificationsForTasks(notifications, new Set(['task-1', 'task-2'])))).toEqual(['n1', 'n3', 'n5']);
    expect(findUnreadNotificationsForTasks(notifications, new Set(['task-3']))).toEqual([]);
  });

  it('finds nothing when no task is seen', () => {
    expect(findUnreadNotificationsForTasks(notifications, new Set())).toEqual([]);
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

describe('collectSeenTaskIds', () => {
  const tasks = [
    { id: 'a1', repeatId: 'series-a' },
    { id: 'a2', repeatId: 'series-a' },
    { id: 'b1', repeatId: 'series-b' },
    { id: 'solo', repeatId: null },
  ];

  it('keeps the focused tasks and drops empty slots', () => {
    expect([...collectSeenTaskIds(tasks, ['solo', null, null])]).toEqual(['solo']);
    expect(collectSeenTaskIds(tasks, [null, null]).size).toBe(0);
  });

  it('adds every loaded occurrence of a focused repeat series', () => {
    // A series edit notifies once, on one occurrence: opening another
    // occurrence of the same series must still count as seeing it.
    expect([...collectSeenTaskIds(tasks, ['a2'])].sort()).toEqual(['a1', 'a2']);
    expect([...collectSeenTaskIds(tasks, ['a1', 'solo'])].sort()).toEqual(['a1', 'a2', 'solo']);
  });

  it('keeps a focused task that is not loaded', () => {
    expect([...collectSeenTaskIds(tasks, ['elsewhere'])]).toEqual(['elsewhere']);
  });
});
