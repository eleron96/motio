type ReadableNotification = {
  id: string;
  readAt: string | null;
};

type IdentifiedNotification = {
  id: string;
};

export const markAllNotificationsAsRead = <T extends ReadableNotification>(
  notifications: T[],
  readAtIso: string,
): T[] => notifications.map((notification) => (
  notification.readAt
    ? notification
    : {
      ...notification,
      readAt: readAtIso,
    }
));

export const removeNotificationsByIds = <T extends IdentifiedNotification>(
  notifications: T[],
  notificationIds: Iterable<string>,
): T[] => {
  const ids = new Set(notificationIds);
  if (ids.size === 0) return notifications;
  return notifications.filter((notification) => !ids.has(notification.id));
};
