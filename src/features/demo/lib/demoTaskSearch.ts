import { findTitleMatch, isSearchableQuery, normalizeSearchQuery } from '@/shared/domain/taskSearch';
import { cloneRow, type Row } from './demoClientCore';
import { demoStore } from './demoDataStore';

const SEARCH_COLUMNS = [
  'id', 'title', 'project_id', 'assignee_id', 'assignee_ids',
  'start_date', 'end_date', 'status_id', 'type_id', 'priority',
  'tag_ids', 'repeat_id', 'updated_at',
] as const;

/** Mirrors search_workspace_tasks while using the same matching rules as the UI. */
export const searchDemoTasks = (workspaceId: string, query: string): Row[] => {
  const needle = normalizeSearchQuery(query);
  if (workspaceId !== demoStore.workspaceId() || !isSearchableQuery(needle)) return [];

  const firstSubtaskByTask = new Map<unknown, string>();
  demoStore.table('task_subtasks')
    .filter((row) => row.workspace_id === workspaceId && findTitleMatch(String(row.title ?? ''), needle))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id)))
    .forEach((row) => {
      if (!firstSubtaskByTask.has(row.task_id)) firstSubtaskByTask.set(row.task_id, String(row.title));
    });

  return demoStore.table('tasks')
    .filter((row) => row.workspace_id === workspaceId
      && (findTitleMatch(String(row.title ?? ''), needle) || firstSubtaskByTask.has(row.id)))
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 200)
    .map((row) => cloneRow({
      // Project before cloning: descriptions can contain large embedded media
      // and must not even be serialized for search.
      ...Object.fromEntries(SEARCH_COLUMNS.map((column) => [column, row[column] ?? null])),
      matched_subtask_title: firstSubtaskByTask.get(row.id) ?? null,
    }));
};
