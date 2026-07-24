// Render the JSON payload the service worker turns into a browser notification.
// Text is localized by the recipient's profile locale (ru/en), mirroring the
// email render helpers (welcomeEmail.ts / broadcastEmail.ts).
export type PushLocale = "ru" | "en";

export interface PushContent {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** Recipient's unread count — the SW mirrors it onto the app icon badge. */
  badge?: number;
}

export const renderTestPush = (locale: PushLocale, appUrl: string): PushContent => {
  const ru = locale === "ru";
  return {
    title: ru ? "Motio — проверка уведомлений" : "Motio — test notification",
    body: ru
      ? "Пуш-уведомления работают. Так будут приходить оповещения о задачах."
      : "Push notifications are working. This is how task alerts will arrive.",
    url: appUrl || "/",
    tag: "motio-test",
  };
};

export type NotificationPushType =
  | "task_assigned"
  | "comment_mention"
  | "task_updated"
  | "deadline_approaching";

export interface NotificationPushInput {
  type: NotificationPushType;
  actorName: string | null;
  taskTitle: string;
  commentPreview: string | null;
}

export interface PushLink {
  taskId: string | null;
  workspaceId: string | null;
}

// Deep link the notification click opens: straight to the task on the timeline
// (/app?ws=..&task=..), with panel=1 when the comments should be visible.
// Falls back to the app root when the notification has no task reference.
export const buildPushUrl = (
  appUrl: string,
  link: PushLink,
  openPanel: boolean,
): string => {
  const base = (appUrl || "").replace(/\/+$/, "");
  if (!link.taskId || !link.workspaceId) return base || "/";
  const params = new URLSearchParams({ ws: link.workspaceId, task: link.taskId });
  if (openPanel) params.set("panel", "1");
  return `${base}/app?${params.toString()}`;
};

// Turn a user_notifications row into the notification the browser shows. Text is
// localized by the recipient's profile locale; `tag` groups by task so a burst
// of edits to the same task collapses instead of stacking.
export const renderNotificationPush = (
  locale: PushLocale,
  input: NotificationPushInput,
  link: PushLink,
  appUrl: string,
): PushContent => {
  const ru = locale === "ru";
  const actor = (input.actorName ?? "").trim();
  const title = input.taskTitle || (ru ? "Задача" : "Task");
  let heading: string;
  let body: string;

  switch (input.type) {
    case "task_assigned":
      heading = ru ? "Новая задача" : "New task";
      body = actor
        ? (ru ? `${actor} назначил(а) вам: ${title}` : `${actor} assigned you: ${title}`)
        : (ru ? `Вам назначена задача: ${title}` : `You were assigned: ${title}`);
      break;
    case "comment_mention":
      heading = ru ? "Упоминание в комментарии" : "Mentioned in a comment";
      body = input.commentPreview
        ? (actor ? `${actor}: ${input.commentPreview}` : input.commentPreview)
        : (ru ? `${actor || "Кто-то"} упомянул(а) вас в «${title}»` : `${actor || "Someone"} mentioned you in "${title}"`);
      break;
    case "task_updated":
      heading = ru ? "Задача изменилась" : "Task updated";
      body = actor
        ? (ru ? `${actor} изменил(а) задачу: ${title}` : `${actor} updated: ${title}`)
        : (ru ? `Изменена задача: ${title}` : `Updated: ${title}`);
      break;
    case "deadline_approaching":
      heading = ru ? "Скоро дедлайн" : "Deadline approaching";
      body = ru ? `Приближается срок: ${title}` : `Due soon: ${title}`;
      break;
  }

  return {
    title: heading,
    body,
    // Mentions open the task with its comments in view; the rest just focus the
    // task on the timeline (mirrors the in-app bell behaviour).
    url: buildPushUrl(appUrl, link, input.type === "comment_mention"),
    tag: link.taskId ? `motio-task-${link.taskId}` : undefined,
  };
};
