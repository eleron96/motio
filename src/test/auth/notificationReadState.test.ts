import { describe, expect, it } from 'vitest';
import { markAllNotificationsAsRead } from '@/features/auth/lib/notificationReadState';

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
});
