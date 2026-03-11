import { describe, expect, it } from 'vitest';
import {
  markAllNotificationsAsRead,
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
