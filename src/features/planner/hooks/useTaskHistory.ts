import { useCallback, useEffect, useState } from 'react';
import { fetchTaskHistory } from '@/infrastructure/tasks/taskHistoryRepository';
import {
  TASK_HISTORY_LIMIT,
  TASK_HISTORY_PREVIEW,
  toTaskHistoryEntries,
  type TaskHistoryEntry,
} from '@/shared/domain/taskHistory';

export interface TaskHistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: TaskHistoryEntry[];
  actorNames: Record<string, string | null>;
  /** Entries that exist but are not on screen yet (never counts past the load limit). */
  hiddenCount: number;
  showMore: () => void;
}

interface Loaded {
  key: string;
  entries: TaskHistoryEntry[];
  actorNames: Record<string, string | null>;
  total: number;
  failed: boolean;
}

/**
 * History of the open card. Nothing is requested until the list is opened;
 * while it is open, a new confirmed task version reloads it.
 */
export const useTaskHistory = (
  taskId: string | null,
  open: boolean,
  updatedAt: string | undefined,
): TaskHistoryState => {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const expanded = expandedTaskId !== null && expandedTaskId === taskId;
  const limit = expanded ? TASK_HISTORY_LIMIT : TASK_HISTORY_PREVIEW;
  const key = `${taskId ?? ''}|${updatedAt ?? ''}|${limit}`;

  useEffect(() => {
    if (!taskId || !open) return;
    let active = true;
    void fetchTaskHistory(taskId, limit)
      .then((page): Loaded => ({
        key,
        entries: toTaskHistoryEntries(page.rows),
        actorNames: page.actorNames,
        total: page.total,
        failed: false,
      }))
      .catch((): Loaded => ({ key, entries: [], actorNames: {}, total: 0, failed: true }))
      .then((next) => {
        if (active) setLoaded(next);
      });
    return () => { active = false; };
  }, [taskId, open, limit, key]);

  const showMore = useCallback(() => setExpandedTaskId(taskId), [taskId]);

  // Entries of another task never show; a reload of the same task keeps the
  // previous list on screen instead of flashing a spinner.
  const current = loaded && loaded.key.startsWith(`${taskId ?? ''}|`) ? loaded : null;
  if (!taskId || !open) {
    return { status: 'idle', entries: [], actorNames: {}, hiddenCount: 0, showMore };
  }
  if (!current) {
    return { status: 'loading', entries: [], actorNames: {}, hiddenCount: 0, showMore };
  }
  if (current.failed) {
    return { status: 'error', entries: [], actorNames: {}, hiddenCount: 0, showMore };
  }
  const reachable = Math.min(current.total, TASK_HISTORY_LIMIT);
  return {
    status: 'ready',
    entries: current.entries,
    actorNames: current.actorNames,
    hiddenCount: Math.max(0, reachable - current.entries.length),
    showMore,
  };
};
