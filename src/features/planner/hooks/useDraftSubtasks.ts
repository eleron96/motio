import React, { useCallback, useRef, useState } from 'react';
import { useDraftSubtaskImages } from '@/features/planner/hooks/useDraftSubtaskImages';
import { pastedImageFiles } from '@/features/planner/lib/pastedImageFiles';
import type { LightboxImage } from '@/shared/lib/lightboxImage';

type DraftSubtask = {
  id: string;
  title: string;
};

const createDraftSubtaskId = () => (
  `draft-subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

interface UseDraftSubtasksOptions {
  workspaceId: string | null;
  releaseTaskMedia: (mediaIds: string[]) => void;
  markChanged: () => void;
}

/**
 * Subtasks typed into a task that does not exist yet, with their pictures:
 * the pictures upload right away and are written with the subtasks once the
 * task is created.
 */
export const useDraftSubtasks = ({ workspaceId, releaseTaskMedia, markChanged }: UseDraftSubtasksOptions) => {
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>([]);
  const focusSubtaskIdRef = useRef<string | null>(null);
  // Pictures of the draft subtasks: uploaded right away, written with the
  // subtasks once the task exists.
  const draftSubtaskImages = useDraftSubtaskImages({
    workspaceId,
    enabled: Boolean(workspaceId),
    releaseTaskMedia,
  });
  const [subtaskImagesError, setSubtaskImagesError] = useState('');
  const subtaskImageInputRef = useRef<HTMLInputElement | null>(null);
  const subtaskImageTargetRef = useRef<string | null>(null);
  const [subtaskLightboxImage, setSubtaskLightboxImage] = useState<LightboxImage | null>(null);

  const handleAddDraftSubtask = () => {
    markChanged();
    const id = createDraftSubtaskId();
    focusSubtaskIdRef.current = id;
    setSubtasks((current) => [...current, { id, title: '' }]);
  };

  const handleDraftSubtaskTitleChange = (subtaskId: string, value: string) => {
    markChanged();
    if (subtaskImagesError) setSubtaskImagesError('');
    setSubtasks((current) => (
      current.map((item) => (item.id === subtaskId ? { ...item, title: value } : item))
    ));
  };

  const handleRemoveSubtask = (subtaskId: string) => {
    markChanged();
    setSubtasks((current) => current.filter((item) => item.id !== subtaskId));
    draftSubtaskImages.discardDraft(subtaskId);
  };

  const handlePickSubtaskImages = (subtaskId: string) => {
    subtaskImageTargetRef.current = subtaskId;
    subtaskImageInputRef.current?.click();
  };

  const handleSubtaskImagePaste = (subtaskId: string) => (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!draftSubtaskImages.canAttachTo(subtaskId)) return;
    const files = pastedImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    markChanged();
    draftSubtaskImages.attach(subtaskId, files);
  };

  // The dialog closed without creating: nothing will show these pictures.
  const { discardAll } = draftSubtaskImages;
  const clearDraftSubtasks = useCallback(() => {
    setSubtasks([]);
    discardAll();
    setSubtaskLightboxImage(null);
    setSubtaskImagesError('');
  }, [discardAll]);

  return {
    subtasks,
    setSubtasks,
    focusSubtaskIdRef,
    draftSubtaskImages,
    subtaskImagesError,
    setSubtaskImagesError,
    subtaskImageInputRef,
    subtaskImageTargetRef,
    subtaskLightboxImage,
    setSubtaskLightboxImage,
    handleAddDraftSubtask,
    handleDraftSubtaskTitleChange,
    handleRemoveSubtask,
    handlePickSubtaskImages,
    handleSubtaskImagePaste,
    clearDraftSubtasks,
  };
};

export type DraftSubtasks = ReturnType<typeof useDraftSubtasks>;
