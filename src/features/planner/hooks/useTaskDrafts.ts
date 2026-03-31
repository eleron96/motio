import { Dispatch, MutableRefObject, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { Task } from '@/features/planner/types/planner';

const areArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const areTasksEqual = (left: Task, right: Task) => (
  left.title === right.title &&
  left.projectId === right.projectId &&
  areArraysEqual(left.assigneeIds, right.assigneeIds) &&
  left.statusId === right.statusId &&
  left.typeId === right.typeId &&
  left.priority === right.priority &&
  left.startDate === right.startDate &&
  left.endDate === right.endDate &&
  // Skip description comparison while it is being lazy-loaded.
  (left.description === undefined || right.description === undefined || left.description === right.description) &&
  areArraysEqual(left.tagIds, right.tagIds)
);

interface UseTaskDraftsParams {
  task: Task | null | undefined;
  selectedTaskId: string | null;
}

export interface UseTaskDraftsResult {
  originalTaskRef: MutableRefObject<Task | null>;
  titleDraftRef: MutableRefObject<string>;
  descriptionDraftRef: MutableRefObject<string>;
  draftTitle: string;
  setDraftTitle: Dispatch<SetStateAction<string>>;
  draftDescription: string;
  setDraftDescription: Dispatch<SetStateAction<string>>;
  isDirty: boolean;
}

export const useTaskDrafts = ({
  task,
  selectedTaskId,
}: UseTaskDraftsParams): UseTaskDraftsResult => {
  const originalTaskRef = useRef<Task | null>(null);
  const titleDraftRef = useRef('');
  const descriptionDraftRef = useRef('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  useEffect(() => {
    if (!selectedTaskId) {
      originalTaskRef.current = null;
      return;
    }
    if (originalTaskRef.current?.id === selectedTaskId) {
      // Backfill description in originalRef when it was initially undefined (lazy-loaded).
      if (originalTaskRef.current.description === undefined && task?.description !== undefined) {
        originalTaskRef.current = { ...originalTaskRef.current, description: task.description };
      }
      return;
    }
    if (task) {
      originalTaskRef.current = {
        ...task,
        assigneeIds: [...task.assigneeIds],
        tagIds: [...task.tagIds],
      };
    }
  }, [selectedTaskId, task]);

  useEffect(() => {
    if (!task) {
      titleDraftRef.current = '';
      descriptionDraftRef.current = '';
      setDraftTitle('');
      setDraftDescription('');
      return;
    }
    titleDraftRef.current = task.title;
    setDraftTitle(task.title);
    const nextDescription = task.description || '';
    descriptionDraftRef.current = nextDescription;
    setDraftDescription(nextDescription);
  }, [task]);

  const isDirty = useMemo(() => {
    if (!task || !originalTaskRef.current) return false;
    return !areTasksEqual(originalTaskRef.current, task);
  }, [task]);

  return {
    originalTaskRef,
    titleDraftRef,
    descriptionDraftRef,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    isDirty,
  };
};
