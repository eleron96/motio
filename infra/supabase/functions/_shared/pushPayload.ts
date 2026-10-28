// Render the JSON payload the service worker turns into a browser notification.
// Text is localized by the recipient's profile locale (ru/en/de), mirroring the
// email render helpers (welcomeEmail.ts / broadcastEmail.ts).
export type PushLocale = "ru" | "en" | "de";

/** The push language for a profile locale; anything unknown gets English. */
export const toPushLocale = (locale: unknown): PushLocale =>
  locale === "ru" || locale === "de" ? locale : "en";

interface PushCopy {
  testTitle: string;
  testBody: string;
  task: string;
  someone: string;
  assignedHeading: string;
  assignedBy: (actor: string, title: string) => string;
  assigned: (title: string) => string;
  mentionHeading: string;
  mentionedIn: (actor: string, title: string) => string;
  updatedHeading: string;
  updatedBy: (actor: string, title: string) => string;
  updated: (title: string) => string;
}

const COPY: Record<PushLocale, PushCopy> = {
  ru: {
    testTitle: "Motio — проверка уведомлений",
    testBody: "Пуш-уведомления работают. Так будут приходить оповещения о задачах.",
    task: "Задача",
    someone: "Кто-то",
    assignedHeading: "Новая задача",
    assignedBy: (actor, title) => `${actor} назначил(а) вам: ${title}`,
    assigned: (title) => `Вам назначена задача: ${title}`,
    mentionHeading: "Упоминание в комментарии",
    mentionedIn: (actor, title) => `${actor} упомянул(а) вас в «${title}»`,
    updatedHeading: "Задача изменилась",
    updatedBy: (actor, title) => `${actor} изменил(а) задачу: ${title}`,
    updated: (title) => `Изменена задача: ${title}`,
  },
  en: {
    testTitle: "Motio — test notification",
    testBody: "Push notifications are working. This is how task alerts will arrive.",
    task: "Task",
    someone: "Someone",
    assignedHeading: "New task",
    assignedBy: (actor, title) => `${actor} assigned you: ${title}`,
    assigned: (title) => `You were assigned: ${title}`,
    mentionHeading: "Mentioned in a comment",
    mentionedIn: (actor, title) => `${actor} mentioned you in "${title}"`,
    updatedHeading: "Task updated",
    updatedBy: (actor, title) => `${actor} updated: ${title}`,
    updated: (title) => `Updated: ${title}`,
  },
  de: {
    testTitle: "Motio – Testbenachrichtigung",
    testBody: "Push-Benachrichtigungen funktionieren. So kommen Hinweise zu Aufgaben bei Ihnen an.",
    task: "Aufgabe",
    someone: "Jemand",
    assignedHeading: "Neue Aufgabe",
    assignedBy: (actor, title) => `${actor} hat Ihnen zugewiesen: ${title}`,
    assigned: (title) => `Ihnen wurde zugewiesen: ${title}`,
    mentionHeading: "In einem Kommentar erwähnt",
    mentionedIn: (actor, title) => `${actor} hat Sie in „${title}“ erwähnt`,
    updatedHeading: "Aufgabe geändert",
    updatedBy: (actor, title) => `${actor} hat geändert: ${title}`,
    updated: (title) => `Geändert: ${title}`,
  },
};

export interface PushContent {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** Recipient's unread count — the SW mirrors it onto the app icon badge. */
  badge?: number;
}

export const renderTestPush = (locale: PushLocale, appUrl: string): PushContent => {
  const copy = COPY[locale];
  return {
    title: copy.testTitle,
    body: copy.testBody,
    url: appUrl || "/",
    tag: "motio-test",
  };
};

export type NotificationPushType =
  | "task_assigned"
  | "comment_mention"
  | "task_updated";

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
  const copy = COPY[locale];
  const actor = (input.actorName ?? "").trim();
  const title = input.taskTitle || copy.task;
  let heading: string;
  let body: string;

  switch (input.type) {
    case "task_assigned":
      heading = copy.assignedHeading;
      body = actor ? copy.assignedBy(actor, title) : copy.assigned(title);
      break;
    case "comment_mention":
      heading = copy.mentionHeading;
      body = input.commentPreview
        ? (actor ? `${actor}: ${input.commentPreview}` : input.commentPreview)
        : copy.mentionedIn(actor || copy.someone, title);
      break;
    case "task_updated":
      heading = copy.updatedHeading;
      body = actor ? copy.updatedBy(actor, title) : copy.updated(title);
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
