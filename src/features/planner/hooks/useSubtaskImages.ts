import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { buildTaskMediaUrl, uploadTaskMediaFile } from '@/infrastructure/tasks/taskMediaRepository';
import {
  appendSubtaskImages,
  MAX_SUBTASK_IMAGES,
  selectSubtaskImageFiles,
  TaskSubtaskImage,
} from '@/shared/domain/taskSubtaskImages';
import { TaskSubtask } from '@/features/planner/types/planner';
import { MutationResult } from '@/features/planner/store/plannerStore.helpers';

/** Upload counters are keyed by subtask id; the new-subtask composer uses this key. */
export const SUBTASK_DRAFT_IMAGES_KEY = '__draft__';

/** What the subtask list needs to show, attach and remove pictures. */
export interface SubtaskImagesController {
  canAttach: boolean;
  /** Pictures already uploaded for the subtask still being typed. */
  draftImages: TaskSubtaskImage[];
  /** Uploads in flight per subtask id (or SUBTASK_DRAFT_IMAGES_KEY). */
  uploading: Record<string, number>;
  resolveSrc: (image: TaskSubtaskImage) => string;
  /** `subtaskId` null attaches to the composer's draft. */
  attach: (subtaskId: string | null, files: File[]) => void;
  remove: (subtaskId: string | null, mediaId: string) => void;
  /** Escape in the composer: the draft's pictures go with its text. */
  discardDraftImages: () => void;
}

interface UseSubtaskImagesParams {
  taskId: string | null;
  currentWorkspaceId: string | null;
  canEdit: boolean;
  subtasksRef: MutableRefObject<TaskSubtask[]>;
  setSubtasks: Dispatch<SetStateAction<TaskSubtask[]>>;
  updateTaskSubtaskImages: (workspaceId: string, taskId: string, subtaskId: string, images: TaskSubtaskImage[]) => Promise<MutationResult>;
  releaseTaskMedia: (mediaIds: string[]) => void;
}

export interface UseSubtaskImagesResult {
  controller: SubtaskImagesController;
  draftImagesRef: MutableRefObject<TaskSubtaskImage[]>;
  /** Clears the draft's pictures once they have been saved with a subtask. */
  clearDraftImages: () => void;
}

const reportRejectedFiles = (selection: ReturnType<typeof selectSubtaskImageFiles<File>>) => {
  if (selection.rejected.some((item) => item.reason === 'too-large')) {
    toast(t`Failed to upload image`, { description: t`Maximum image size is 5 MB.` });
  }
  if (selection.overLimit > 0) {
    toast(t`A subtask can have up to ${MAX_SUBTASK_IMAGES} images.`);
  }
};

/**
 * Pictures on subtasks: uploads go through task media like description
 * pictures, the subtask stores the references. A picture taken off a subtask
 * (or a subtask deleted, or a draft dropped) is handed to media GC only after
 * the write that dropped it has succeeded.
 */
export const useSubtaskImages = ({
  taskId,
  currentWorkspaceId,
  canEdit,
  subtasksRef,
  setSubtasks,
  updateTaskSubtaskImages,
  releaseTaskMedia,
}: UseSubtaskImagesParams): UseSubtaskImagesResult => {
  const [draftImages, setDraftImagesState] = useState<TaskSubtaskImage[]>([]);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const draftImagesRef = useRef(draftImages);
  const activeTaskIdRef = useRef(taskId);
  activeTaskIdRef.current = taskId;
  // One image write per subtask at a time: each starts from the result of the
  // previous one, so two quick attaches never overwrite each other.
  const writeChainsRef = useRef(new Map<string, Promise<void>>());

  const setDraftImages = useCallback((next: TaskSubtaskImage[]) => {
    draftImagesRef.current = next;
    setDraftImagesState(next);
  }, []);

  useEffect(() => {
    setDraftImages([]);
    setUploading({});
    writeChainsRef.current.clear();
  }, [currentWorkspaceId, setDraftImages, taskId]);

  const bumpUploading = useCallback((key: string, delta: number) => {
    setUploading((current) => {
      const next = { ...current, [key]: Math.max(0, (current[key] ?? 0) + delta) };
      if (next[key] === 0) delete next[key];
      return next;
    });
  }, []);

  const writeSubtaskImages = useCallback((
    subtaskId: string,
    change: (images: TaskSubtaskImage[]) => TaskSubtaskImage[],
    onSaved: (previous: TaskSubtaskImage[], next: TaskSubtaskImage[]) => void,
    onFailed: () => void,
  ) => {
    if (!taskId || !currentWorkspaceId) return;
    const chain = writeChainsRef.current.get(subtaskId) ?? Promise.resolve();
    const run = chain.then(async () => {
      const current = subtasksRef.current.find((item) => item.id === subtaskId);
      if (!current) {
        onFailed();
        return;
      }
      const previous = current.images;
      const next = change(previous);
      setSubtasks((items) => items.map((item) => (item.id === subtaskId ? { ...item, images: next } : item)));
      subtasksRef.current = subtasksRef.current.map((item) => (
        item.id === subtaskId ? { ...item, images: next } : item
      ));
      const result = await updateTaskSubtaskImages(currentWorkspaceId, taskId, subtaskId, next);
      if (result.error) {
        if (activeTaskIdRef.current === taskId) {
          setSubtasks((items) => items.map((item) => (item.id === subtaskId ? { ...item, images: previous } : item)));
        }
        toast.error(t`Failed to update subtask.`);
        onFailed();
        return;
      }
      onSaved(previous, next);
    });
    writeChainsRef.current.set(subtaskId, run.catch(() => {}));
  }, [currentWorkspaceId, setSubtasks, subtasksRef, taskId, updateTaskSubtaskImages]);

  const attach = useCallback((subtaskId: string | null, files: File[]) => {
    if (!canEdit || !taskId || !currentWorkspaceId || files.length === 0) return;
    const key = subtaskId ?? SUBTASK_DRAFT_IMAGES_KEY;
    const existing = subtaskId
      ? subtasksRef.current.find((item) => item.id === subtaskId)?.images.length ?? 0
      : draftImagesRef.current.length;
    const selection = selectSubtaskImageFiles(files, existing, uploading[key] ?? 0);
    reportRejectedFiles(selection);
    if (selection.accepted.length === 0) return;

    const uploadTaskId = taskId;
    bumpUploading(key, selection.accepted.length);
    void Promise.all(selection.accepted.map(async (file) => {
      try {
        return await uploadTaskMediaFile(currentWorkspaceId, file);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        toast(t`Failed to upload image`, message ? { description: message } : undefined);
        return null;
      } finally {
        if (activeTaskIdRef.current === uploadTaskId) bumpUploading(key, -1);
      }
    })).then((results) => {
      const uploaded = results.filter((item): item is TaskSubtaskImage => item !== null);
      if (uploaded.length === 0) return;
      // The card moved on while uploading: nothing will show these files.
      if (activeTaskIdRef.current !== uploadTaskId) {
        releaseTaskMedia(uploaded.map((image) => image.id));
        return;
      }
      if (!subtaskId) {
        setDraftImages(appendSubtaskImages(draftImagesRef.current, uploaded));
        return;
      }
      writeSubtaskImages(
        subtaskId,
        (images) => appendSubtaskImages(images, uploaded),
        (_previous, next) => {
          const kept = new Set(next.map((image) => image.id));
          const dropped = uploaded.filter((image) => !kept.has(image.id)).map((image) => image.id);
          if (dropped.length > 0) releaseTaskMedia(dropped);
        },
        () => releaseTaskMedia(uploaded.map((image) => image.id)),
      );
    });
  }, [
    bumpUploading,
    canEdit,
    currentWorkspaceId,
    releaseTaskMedia,
    setDraftImages,
    subtasksRef,
    taskId,
    uploading,
    writeSubtaskImages,
  ]);

  const remove = useCallback((subtaskId: string | null, mediaId: string) => {
    if (!canEdit) return;
    if (!subtaskId) {
      if (!draftImagesRef.current.some((image) => image.id === mediaId)) return;
      setDraftImages(draftImagesRef.current.filter((image) => image.id !== mediaId));
      releaseTaskMedia([mediaId]);
      return;
    }
    writeSubtaskImages(
      subtaskId,
      (images) => images.filter((image) => image.id !== mediaId),
      (previous) => {
        if (previous.some((image) => image.id === mediaId)) releaseTaskMedia([mediaId]);
      },
      () => {},
    );
  }, [canEdit, releaseTaskMedia, setDraftImages, writeSubtaskImages]);

  const discardDraftImages = useCallback(() => {
    const dropped = draftImagesRef.current.map((image) => image.id);
    if (dropped.length === 0) return;
    setDraftImages([]);
    releaseTaskMedia(dropped);
  }, [releaseTaskMedia, setDraftImages]);

  const clearDraftImages = useCallback(() => setDraftImages([]), [setDraftImages]);

  return {
    controller: {
      canAttach: canEdit,
      draftImages,
      uploading,
      resolveSrc: buildTaskMediaUrl,
      attach,
      remove,
      discardDraftImages,
    },
    draftImagesRef,
    clearDraftImages,
  };
};
