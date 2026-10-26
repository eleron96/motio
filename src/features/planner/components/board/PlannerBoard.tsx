import React, { useCallback, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useBoardColumns, useBoardScopeLifecycle } from '@/features/planner/hooks/useBoardColumns';
import { isBoardTaskOverdue } from '@/shared/domain/boardColumns';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { format, parseISO } from '@/features/planner/lib/dateUtils';
import type { Assignee } from '@/features/planner/types/planner';
import { BoardColumn } from './BoardColumn';
import { BoardCard } from './BoardCard';

export type BoardCreateTaskDefaults = {
  startDate: string;
  endDate: string;
  statusId: string;
};

interface PlannerBoardProps {
  onCreateTask: (defaults: BoardCreateTaskDefaults) => void;
}

const NO_PEOPLE: Assignee[] = [];

/**
 * The board (kanban) surface of the planner: one column per status, tasks as
 * cards. Dragging a card to another column changes its status (undoable, like
 * the status item of the task menu). Desktop only for now; mouse drag uses the
 * native HTML drag-and-drop — the board only needs "drop into a column", none
 * of the timeline's resize or edge auto-scroll.
 */
export const PlannerBoard: React.FC<PlannerBoardProps> = ({ onCreateTask }) => {
  const workspaceId = usePlannerStore((state) => state.workspaceId);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const taskCommentCounts = usePlannerStore((state) => state.taskCommentCounts);
  const highlightedTaskId = usePlannerStore((state) => state.highlightedTaskId);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const updateTaskWithUndo = usePlannerStore((state) => state.updateTaskWithUndo);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const today = useTodayKey();

  useBoardScopeLifecycle(workspaceId);
  const columns = useBoardColumns();

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const assigneeById = useMemo(() => new Map(assignees.map((person) => [person.id, person])), [assignees]);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropStatusId, setDropStatusId] = useState<string | null>(null);

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDropStatusId(null);
  }, []);

  const handleDrop = useCallback((statusId: string) => {
    const taskId = draggingTaskId;
    setDraggingTaskId(null);
    setDropStatusId(null);
    if (!taskId || !canEdit) return;
    const task = usePlannerStore.getState().tasks.find((item) => item.id === taskId);
    if (!task || task.statusId === statusId) return;
    void updateTaskWithUndo(taskId, { statusId });
  }, [canEdit, draggingTaskId, updateTaskWithUndo]);

  const handleCreate = useCallback((statusId: string) => {
    onCreateTask({ startDate: today, endDate: today, statusId });
  }, [onCreateTask, today]);

  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t`No statuses in this workspace yet`}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4" data-testid="planner-board">
      {columns.map((column) => (
        <BoardColumn
          key={column.status.id}
          column={column}
          isDropTarget={draggingTaskId !== null && dropStatusId === column.status.id}
          canCreate={canEdit}
          onCreate={handleCreate}
          onDragOver={setDropStatusId}
          onDragLeave={(statusId) => setDropStatusId((current) => (current === statusId ? null : current))}
          onDrop={handleDrop}
        >
          {column.tasks.map((task) => {
            const people = task.assigneeIds.length === 0
              ? NO_PEOPLE
              : task.assigneeIds
                .map((id) => assigneeById.get(id))
                .filter((person): person is Assignee => Boolean(person));
            return (
              <BoardCard
                key={task.id}
                task={task}
                kind={column.kind}
                overdue={isBoardTaskOverdue(task, column.kind, today)}
                project={task.projectId ? projectById.get(task.projectId) : undefined}
                people={people}
                commentCount={taskCommentCounts[task.id] ?? 0}
                dueLabel={format(parseISO(task.endDate), 'd MMM', { locale: dateLocale })}
                canEdit={canEdit}
                highlighted={highlightedTaskId === task.id}
                dragging={draggingTaskId === task.id}
                onOpen={setSelectedTaskId}
                onDragStart={setDraggingTaskId}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </BoardColumn>
      ))}
    </div>
  );
};
