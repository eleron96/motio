type ReadableNotification = {
  id: string;
  readAt: string | null;
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
