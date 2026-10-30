/**
 * Live drafts in an open task card: what each person is typing right now,
 * shared through a private Realtime Presence channel per task (migration
 * 0159). Teammates see it semi-transparent — a subtask taking shape under the
 * list, an edit under the subtask it changes, a comment above the composer —
 * so two people stop writing the same thing or over each other.
 *
 * Nothing here is stored: Presence lives in Realtime's memory and is gone when
 * the person closes the card or the tab.
 */
export type TaskDraft =
  | { kind: 'subtask-new'; text: string }
  | { kind: 'subtask-edit'; subtaskId: string; text: string }
  | { kind: 'comment'; text: string }
  /** The description itself is not shared (rich HTML), only that someone edits it. */
  | { kind: 'description' };

/** Which part of the card a draft belongs to; one draft per slot per person. */
export type TaskDraftSlot = TaskDraft['kind'];

/** What one person's client tracks in the channel. */
export type TaskDraftPresenceMeta = {
  userId: string;
  drafts: TaskDraft[];
};

export type TeammateDraft = {
  userId: string;
  draft: TaskDraft;
};

/** Enough for a subtask or a comment preview; longer text is cut, not sent. */
export const TASK_DRAFT_TEXT_LIMIT = 500;

export const clampTaskDraft = (draft: TaskDraft): TaskDraft => (
  'text' in draft && draft.text.length > TASK_DRAFT_TEXT_LIMIT
    ? { ...draft, text: draft.text.slice(0, TASK_DRAFT_TEXT_LIMIT) }
    : draft
);

/** A draft worth showing: a description edit, or text that isn't blank. */
const isVisibleDraft = (draft: TaskDraft) => (
  draft.kind === 'description' || draft.text.trim().length > 0
);

const isDraft = (value: unknown): value is TaskDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as { kind?: unknown; text?: unknown; subtaskId?: unknown };
  switch (draft.kind) {
    case 'description':
      return true;
    case 'subtask-edit':
      return typeof draft.subtaskId === 'string' && typeof draft.text === 'string';
    case 'subtask-new':
    case 'comment':
      return typeof draft.text === 'string';
    default:
      return false;
  }
};

const readMeta = (value: unknown): { userId: string; drafts: unknown[] } | null => {
  if (!value || typeof value !== 'object') return null;
  const meta = value as { userId?: unknown; drafts?: unknown };
  if (typeof meta.userId !== 'string' || !Array.isArray(meta.drafts)) return null;
  return { userId: meta.userId, drafts: meta.drafts };
};

/**
 * Teammates' drafts from a Presence state (`key -> metas`): without ours,
 * without anyone outside the workspace's member list, one per person and
 * field (several tabs of one person collapse), blank ones dropped. The
 * payload comes from other clients, so its shape is checked, not trusted.
 */
export const collectTeammateDrafts = (
  state: Record<string, unknown[]>,
  selfUserId: string | null,
  memberIds: ReadonlySet<string>,
): TeammateDraft[] => {
  const seen = new Set<string>();
  const drafts: TeammateDraft[] = [];
  for (const metas of Object.values(state)) {
    for (const rawMeta of metas) {
      const meta = readMeta(rawMeta);
      if (!meta || meta.userId === selfUserId || !memberIds.has(meta.userId)) continue;
      for (const draft of meta.drafts) {
        if (!isDraft(draft) || !isVisibleDraft(draft)) continue;
        const fieldKey = draft.kind === 'subtask-edit'
          ? `${meta.userId}:subtask-edit:${draft.subtaskId}`
          : `${meta.userId}:${draft.kind}`;
        if (seen.has(fieldKey)) continue;
        seen.add(fieldKey);
        drafts.push({ userId: meta.userId, draft: clampTaskDraft(draft) });
      }
    }
  }
  return drafts.sort((left, right) => left.userId.localeCompare(right.userId));
};

export const areTaskDraftsEqual = (left: TaskDraft | null, right: TaskDraft | null) => {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === 'description') return true;
  if (left.kind === 'subtask-edit' && right.kind === 'subtask-edit' && left.subtaskId !== right.subtaskId) return false;
  return 'text' in left && 'text' in right && left.text === right.text;
};
