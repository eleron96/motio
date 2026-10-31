import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { buildTaskMediaUrl, uploadTaskMediaFile } from '@/infrastructure/tasks/taskMediaRepository';
import { isDemoClientActive } from '@/shared/lib/supabaseClient';
import {
  appendSubtaskImages,
  MAX_SUBTASK_IMAGES,
  selectSubtaskImageFiles,
  TaskSubtaskImage,
} from '@/shared/domain/taskSubtaskImages';

/**
 * Pictures on the subtask drafts of the new-task form, before the task exists.
 * A picture only needs the workspace to upload (task media), so it goes up
 * right away and the draft keeps the reference; the subtasks are written with
 * their pictures once the task is created. Anything not written by then —
 * the form cancelled, a draft removed, a draft left without a title — is
 * handed back to media GC.
 */
export interface DraftSubtaskImages {
  imagesFor: (draftId: string) => TaskSubtaskImage[];
  uploadingFor: (draftId: string) => number;
  /** Room for another picture on this draft (the cap counts uploads in flight). */
  canAttachTo: (draftId: string) => boolean;
  resolveSrc: (image: TaskSubtaskImage) => string;
  attach: (draftId: string, files: File[]) => void;
  remove: (draftId: string, mediaId: string) => void;
  /** A draft subtask was removed: its pictures go with it. */
  discardDraft: (draftId: string) => void;
  /** The form closed without creating the task. */
  discardAll: () => void;
  /** Resolves once this form's uploads still on their way have landed. */
  waitForUploads: () => Promise<void>;
  /** Every draft's pictures as they stand, keyed by draft id. */
  snapshot: () => Record<string, TaskSubtaskImage[]>;
  /** The pictures were written with the subtasks (or released): let go of them without releasing. */
  forget: () => void;
}

const NO_IMAGES: TaskSubtaskImage[] = [];

export const useDraftSubtaskImages = ({
  workspaceId,
  enabled: enabledParam,
  releaseTaskMedia,
}: {
  workspaceId: string | null;
  enabled: boolean;
  releaseTaskMedia: (mediaIds: string[]) => void;
}): DraftSubtaskImages => {
  // The sandbox has no media storage: no pictures there, as in its task card.
  const enabled = enabledParam && !isDemoClientActive();
  const [images, setImagesState] = useState<Record<string, TaskSubtaskImage[]>>({});
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const imagesRef = useRef(images);
  const uploadingRef = useRef(uploading);
  // Bumped whenever the form lets go of its drafts: an upload that finishes
  // after that belongs to nothing and is released instead of kept.
  const sessionRef = useRef(0);
  const pendingUploadsRef = useRef(new Set<Promise<unknown>>());

  const setImages = useCallback((next: Record<string, TaskSubtaskImage[]>) => {
    imagesRef.current = next;
    setImagesState(next);
  }, []);

  const bumpUploading = useCallback((draftId: string, delta: number) => {
    const current = uploadingRef.current;
    const count = Math.max(0, (current[draftId] ?? 0) + delta);
    const next = { ...current, [draftId]: count };
    if (count === 0) delete next[draftId];
    uploadingRef.current = next;
    setUploading(next);
  }, []);

  const attach = useCallback((draftId: string, files: File[]) => {
    if (!enabled || !workspaceId || files.length === 0) return;
    const selection = selectSubtaskImageFiles(
      files,
      imagesRef.current[draftId]?.length ?? 0,
      uploadingRef.current[draftId] ?? 0,
    );
    if (selection.rejected.some((item) => item.reason === 'too-large')) {
      toast(t`Failed to upload image`, { description: t`Maximum image size is 5 MB.` });
    }
    if (selection.overLimit > 0) {
      toast(t`A subtask can have up to ${MAX_SUBTASK_IMAGES} images.`);
    }
    if (selection.accepted.length === 0) return;

    const session = sessionRef.current;
    bumpUploading(draftId, selection.accepted.length);
    const upload = Promise.all(selection.accepted.map(async (file) => {
      try {
        return await uploadTaskMediaFile(workspaceId, file);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        toast(t`Failed to upload image`, message ? { description: message } : undefined);
        return null;
      } finally {
        if (sessionRef.current === session) bumpUploading(draftId, -1);
      }
    })).then((results) => {
      const uploaded = results.filter((item): item is TaskSubtaskImage => item !== null);
      if (uploaded.length === 0) return;
      if (sessionRef.current !== session) {
        releaseTaskMedia(uploaded.map((image) => image.id));
        return;
      }
      const merged = appendSubtaskImages(imagesRef.current[draftId] ?? [], uploaded);
      const kept = new Set(merged.map((image) => image.id));
      const dropped = uploaded.filter((image) => !kept.has(image.id)).map((image) => image.id);
      if (dropped.length > 0) releaseTaskMedia(dropped);
      setImages({ ...imagesRef.current, [draftId]: merged });
    });
    const pending = pendingUploadsRef.current;
    pending.add(upload);
    void upload.finally(() => pending.delete(upload));
  }, [bumpUploading, enabled, releaseTaskMedia, setImages, workspaceId]);

  const remove = useCallback((draftId: string, mediaId: string) => {
    const current = imagesRef.current[draftId] ?? [];
    if (!current.some((image) => image.id === mediaId)) return;
    setImages({ ...imagesRef.current, [draftId]: current.filter((image) => image.id !== mediaId) });
    releaseTaskMedia([mediaId]);
  }, [releaseTaskMedia, setImages]);

  const discardDraft = useCallback((draftId: string) => {
    const current = imagesRef.current[draftId] ?? [];
    if (current.length === 0) return;
    const next = { ...imagesRef.current };
    delete next[draftId];
    setImages(next);
    releaseTaskMedia(current.map((image) => image.id));
  }, [releaseTaskMedia, setImages]);

  const reset = useCallback(() => {
    sessionRef.current += 1;
    // A new set, so a reopened form never waits on the previous one's uploads.
    pendingUploadsRef.current = new Set();
    uploadingRef.current = {};
    setUploading({});
    setImages({});
  }, [setImages]);

  const discardAll = useCallback(() => {
    const all = Object.values(imagesRef.current).flat().map((image) => image.id);
    reset();
    if (all.length > 0) releaseTaskMedia(all);
  }, [releaseTaskMedia, reset]);

  const waitForUploads = useCallback(async () => {
    // Until nothing of this form is on its way: a picture added while waiting
    // is waited for too.
    let pending = [...pendingUploadsRef.current];
    while (pending.length > 0) {
      await Promise.all(pending);
      pending = [...pendingUploadsRef.current];
    }
  }, []);

  const snapshot = useCallback(() => imagesRef.current, []);

  // Unmounted without closing (navigating away with the form open): nothing
  // will show these pictures any more.
  const discardAllRef = useRef(discardAll);
  discardAllRef.current = discardAll;
  useEffect(() => () => discardAllRef.current(), []);

  const imagesFor = useCallback((draftId: string) => images[draftId] ?? NO_IMAGES, [images]);
  const uploadingFor = useCallback((draftId: string) => uploading[draftId] ?? 0, [uploading]);
  const canAttachTo = useCallback((draftId: string) => (
    enabled && (images[draftId]?.length ?? 0) + (uploading[draftId] ?? 0) < MAX_SUBTASK_IMAGES
  ), [enabled, images, uploading]);

  return {
    imagesFor,
    uploadingFor,
    canAttachTo,
    resolveSrc: buildTaskMediaUrl,
    attach,
    remove,
    discardDraft,
    discardAll,
    waitForUploads,
    snapshot,
    forget: reset,
  };
};
