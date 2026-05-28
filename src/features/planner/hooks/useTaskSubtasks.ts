import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { TaskSubtask } from '@/features/planner/types/planner';
import { MutationResult } from '@/features/planner/store/plannerStore.helpers';

interface UseTaskSubtasksParams {
  taskId: string | null;
  currentWorkspaceId: string | null;
  canEdit: boolean;
  fetchTaskSubtasks: (workspaceId: string, taskId: string) => Promise<{ subtasks: TaskSubtask[]; error?: string }>;
  createTaskSubtask: (workspaceId: string, taskId: string, title: string, position: number) => Promise<{ subtask?: TaskSubtask; error?: string }>;
  updateTaskSubtaskTitle: (workspaceId: string, taskId: string, subtaskId: string, title: string) => Promise<MutationResult>;
  updateTaskSubtaskCompletion: (workspaceId: string, taskId: string, subtaskId: string, isDone: boolean, doneAt: string | null) => Promise<MutationResult>;
  deleteTaskSubtask: (workspaceId: string, taskId: string, subtaskId: string) => Promise<MutationResult>;
}

export interface UseTaskSubtasksResult {
  subtasksOpen: boolean;
  setSubtasksOpen: Dispatch<SetStateAction<boolean>>;
  subtasksLoading: boolean;
  subtasksSaving: boolean;
  subtasksError: string;
  setSubtasksError: Dispatch<SetStateAction<string>>;
  subtasks: TaskSubtask[];
  newSubtaskTitle: string;
  setNewSubtaskTitle: Dispatch<SetStateAction<string>>;
  completedSubtasksCount: number;
  subtaskInputRef: MutableRefObject<HTMLInputElement | null>;
  handleOpenSubtasks: () => void;
  handleAddSubtask: () => Promise<void>;
  handleEditSubtask: (subtaskId: string, title: string) => Promise<boolean>;
  handleToggleSubtask: (subtaskId: string, isDone: boolean) => Promise<void>;
  handleDeleteSubtask: (subtaskId: string) => Promise<void>;
}

export const useTaskSubtasks = ({
  taskId,
  currentWorkspaceId,
  canEdit,
  fetchTaskSubtasks,
  createTaskSubtask,
  updateTaskSubtaskTitle,
  updateTaskSubtaskCompletion,
  deleteTaskSubtask,
}: UseTaskSubtasksParams): UseTaskSubtasksResult => {
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [subtasksSaving, setSubtasksSaving] = useState(false);
  const [subtasksError, setSubtasksError] = useState('');
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSubtasksOpen(false);
    setSubtasks([]);
    setNewSubtaskTitle('');
    setSubtasksError('');
    setSubtasksLoading(false);
    setSubtasksSaving(false);
    if (!taskId || !currentWorkspaceId) return;
    let active = true;

    const loadSubtasks = async () => {
      setSubtasksLoading(true);
      setSubtasksError('');
      const result = await fetchTaskSubtasks(currentWorkspaceId, taskId);

      if (!active) return;
      if (result.error) {
        setSubtasksError(result.error);
        setSubtasks([]);
        setSubtasksLoading(false);
        return;
      }

      setSubtasks(result.subtasks);
      setSubtasksOpen(result.subtasks.length > 0);
      setSubtasksLoading(false);
    };

    void loadSubtasks();
    return () => {
      active = false;
    };
  }, [currentWorkspaceId, fetchTaskSubtasks, taskId]);

  const completedSubtasksCount = useMemo(
    () => subtasks.reduce((total, subtask) => total + (subtask.isDone ? 1 : 0), 0),
    [subtasks],
  );

  const handleOpenSubtasks = useCallback(() => {
    setSubtasksOpen(true);
    setSubtasksError('');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        subtaskInputRef.current?.focus();
      });
    }
  }, []);

  const handleAddSubtask = useCallback(async () => {
    if (!taskId || !currentWorkspaceId || !canEdit) return;
    const title = newSubtaskTitle.trim();
    if (!title) return;

    const nextPosition = subtasks.length > 0
      ? Math.max(...subtasks.map((item) => item.position)) + 1
      : 0;

    setSubtasksSaving(true);
    setSubtasksError('');

    const result = await createTaskSubtask(currentWorkspaceId, taskId, title, nextPosition);
    if (result.error || !result.subtask) {
      setSubtasksError(result.error ?? t`Failed to add subtask.`);
      setSubtasksSaving(false);
      return;
    }

    const createdSubtask = result.subtask;
    setSubtasks((current) => [...current, createdSubtask]);
    setNewSubtaskTitle('');
    setSubtasksSaving(false);
    subtaskInputRef.current?.focus();
  }, [canEdit, createTaskSubtask, currentWorkspaceId, newSubtaskTitle, subtasks, taskId]);

  const handleEditSubtask = useCallback(async (subtaskId: string, title: string) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return false;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return false;

    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === previous.title) return true;

    setSubtasksError('');
    setSubtasks((current) => current.map((item) => (
      item.id === subtaskId ? { ...item, title: nextTitle } : item
    )));

    const result = await updateTaskSubtaskTitle(currentWorkspaceId, taskId, subtaskId, nextTitle);
    if (result.error) {
      setSubtasks((current) => current.map((item) => (
        item.id === subtaskId ? { ...item, title: previous.title } : item
      )));
      setSubtasksError(result.error || t`Failed to update subtask.`);
      return false;
    }

    return true;
  }, [canEdit, currentWorkspaceId, subtasks, taskId, updateTaskSubtaskTitle]);

  const handleToggleSubtask = useCallback(async (subtaskId: string, isDone: boolean) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return;

    const nextDoneAt = isDone ? new Date().toISOString() : null;
    setSubtasksError('');
    setSubtasks((current) => current.map((item) => (
      item.id === subtaskId
        ? { ...item, isDone, doneAt: nextDoneAt }
        : item
    )));

    const result = await updateTaskSubtaskCompletion(
      currentWorkspaceId,
      taskId,
      subtaskId,
      isDone,
      nextDoneAt,
    );
    if (result.error) {
      setSubtasks((current) => current.map((item) => (
        item.id === subtaskId
          ? { ...item, isDone: previous.isDone, doneAt: previous.doneAt }
          : item
      )));
      setSubtasksError(result.error);
    }
  }, [canEdit, currentWorkspaceId, subtasks, taskId, updateTaskSubtaskCompletion]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return;

    setSubtasksError('');
    setSubtasks((current) => current.filter((item) => item.id !== subtaskId));

    const result = await deleteTaskSubtask(currentWorkspaceId, taskId, subtaskId);
    if (result.error) {
      setSubtasks((current) => (
        [...current, previous].sort((left, right) => left.position - right.position)
      ));
      setSubtasksError(result.error || t`Failed to delete subtask.`);
    }
  }, [canEdit, currentWorkspaceId, deleteTaskSubtask, subtasks, taskId]);

  return {
    subtasksOpen,
    setSubtasksOpen,
    subtasksLoading,
    subtasksSaving,
    subtasksError,
    setSubtasksError,
    subtasks,
    newSubtaskTitle,
    setNewSubtaskTitle,
    completedSubtasksCount,
    subtaskInputRef,
    handleOpenSubtasks,
    handleAddSubtask,
    handleEditSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
  };
};
