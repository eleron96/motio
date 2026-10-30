/**
 * Pictures on a subtask: references to task media (`task_subtasks.images`,
 * migration 0160). The subtask keeps only the media id and its view token;
 * the file itself lives with the description pictures.
 */
export interface TaskSubtaskImage {
  id: string;
  token: string;
}

/** Same cap as the database check on `task_subtasks.images`. */
export const MAX_SUBTASK_IMAGES = 10;

/** Same cap as the task-media upload function and the description editor. */
export const MAX_TASK_IMAGE_BYTES = 5 * 1024 * 1024;

const isImageRef = (value: unknown): value is TaskSubtaskImage => (
  typeof value === 'object'
  && value !== null
  && typeof (value as { id?: unknown }).id === 'string'
  && typeof (value as { token?: unknown }).token === 'string'
  && (value as { id: string }).id.trim() !== ''
);

/**
 * Reads the column as stored; anything that isn't a well-formed reference is
 * dropped rather than trusted (a row from an older client, the demo store).
 */
export const parseTaskSubtaskImages = (raw: unknown): TaskSubtaskImage[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const images: TaskSubtaskImage[] = [];
  for (const value of raw) {
    if (!isImageRef(value) || seen.has(value.id)) continue;
    seen.add(value.id);
    images.push({ id: value.id, token: value.token });
  }
  return images;
};

export const subtaskImageMediaIds = (images: TaskSubtaskImage[]): string[] => (
  images.map((image) => image.id)
);

/** Media ids that `previous` showed and `next` no longer does — GC candidates. */
export const diffRemovedSubtaskImageIds = (
  previous: TaskSubtaskImage[],
  next: TaskSubtaskImage[],
): string[] => {
  const kept = new Set(next.map((image) => image.id));
  return previous.filter((image) => !kept.has(image.id)).map((image) => image.id);
};

/** Appends new pictures, skipping repeats, without going past the cap. */
export const appendSubtaskImages = (
  current: TaskSubtaskImage[],
  added: TaskSubtaskImage[],
): TaskSubtaskImage[] => {
  const merged = [...current];
  for (const image of added) {
    if (merged.length >= MAX_SUBTASK_IMAGES) break;
    if (merged.some((item) => item.id === image.id)) continue;
    merged.push(image);
  }
  return merged;
};

export type SubtaskImageFileRejection = 'not-image' | 'too-large';

export interface SubtaskImageFileSelection<F extends { type: string; size: number }> {
  accepted: F[];
  rejected: Array<{ file: F; reason: SubtaskImageFileRejection }>;
  /** Files left out because the subtask would go past MAX_SUBTASK_IMAGES. */
  overLimit: number;
}

/**
 * Which picked or pasted files can go onto a subtask that already shows
 * `existingCount` pictures (plus `pendingCount` still uploading).
 */
export const selectSubtaskImageFiles = <F extends { type: string; size: number }>(
  files: F[],
  existingCount: number,
  pendingCount = 0,
): SubtaskImageFileSelection<F> => {
  const rejected: SubtaskImageFileSelection<F>['rejected'] = [];
  const valid: F[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) rejected.push({ file, reason: 'not-image' });
    else if (file.size > MAX_TASK_IMAGE_BYTES) rejected.push({ file, reason: 'too-large' });
    else valid.push(file);
  }
  const room = Math.max(0, MAX_SUBTASK_IMAGES - existingCount - pendingCount);
  return {
    accepted: valid.slice(0, room),
    rejected,
    overLimit: Math.max(0, valid.length - room),
  };
};
