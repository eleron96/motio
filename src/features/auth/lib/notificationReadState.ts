type ReadableNotification = {
  id: string;
  readAt: string | null;
};

type IdentifiedNotification = {
  id: string;
};

type TaskLinkedNotification = ReadableNotification & {
  taskId: string | null;
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

/** Ids of the unread notifications about one task — what opening its card reads. */
export const findUnreadNotificationIdsForTask = <T extends TaskLinkedNotification>(
  notifications: T[],
  taskId: string | null,
): string[] => {
  if (!taskId) return [];
  return notifications
    .filter((notification) => notification.taskId === taskId && !notification.readAt)
    .map((notification) => notification.id);
};

export const markNotificationsAsReadByIds = <T extends ReadableNotification>(
  notifications: T[],
  notificationIds: Iterable<string>,
  readAtIso: string,
): T[] => {
  const ids = new Set(notificationIds);
  if (ids.size === 0) return notifications;
  return notifications.map((notification) => (
    ids.has(notification.id) && !notification.readAt
      ? { ...notification, readAt: readAtIso }
      : notification
  ));
};
