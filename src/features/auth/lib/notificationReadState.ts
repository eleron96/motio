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

type SeriesLinkedTask = {
  id: string;
  repeatId: string | null;
};

/**
 * The tasks the user is looking at right now: the given ones (open card,
 * highlighted bar, tap preview) plus every loaded occurrence of their repeat
 * series. A series edit notifies once, on one occurrence, so opening any
 * occurrence of that series has to count as seeing it.
 */
export const collectSeenTaskIds = (
  tasks: SeriesLinkedTask[],
  focusedTaskIds: Array<string | null>,
): Set<string> => {
  const seen = new Set(focusedTaskIds.filter((id): id is string => Boolean(id)));
  if (seen.size === 0) return seen;
  const repeatIds = new Set(
    tasks
      .filter((task) => seen.has(task.id) && task.repeatId)
      .map((task) => task.repeatId as string),
  );
  if (repeatIds.size === 0) return seen;
  tasks.forEach((task) => {
    if (task.repeatId && repeatIds.has(task.repeatId)) seen.add(task.id);
  });
  return seen;
};

/** The unread notifications about the seen tasks — what looking at them reads. */
export const findUnreadNotificationsForTasks = <T extends TaskLinkedNotification>(
  notifications: T[],
  taskIds: ReadonlySet<string>,
): T[] => {
  if (taskIds.size === 0) return [];
  return notifications.filter((notification) => (
    notification.taskId !== null && taskIds.has(notification.taskId) && !notification.readAt
  ));
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
