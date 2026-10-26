import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useBoardColumns, useBoardScopeLifecycle } from '@/features/planner/hooks/useBoardColumns';
import { isBoardTaskOverdue } from '@/shared/domain/boardColumns';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { format, parseISO } from '@/features/planner/lib/dateUtils';
import { getEdgeScrollVelocity } from '@/features/planner/lib/dragAutoScroll';
import type { Assignee } from '@/features/planner/types/planner';
import { BoardColumn } from './BoardColumn';
import { BoardCard } from './BoardCard';
import { BoardQuickFilters } from './BoardQuickFilters';

export type BoardCreateTaskDefaults = {
  startDate: string;
  endDate: string;
  statusId: string;
};

interface PlannerBoardProps {
  onCreateTask: (defaults: BoardCreateTaskDefaults) => void;
}

const NO_PEOPLE: Assignee[] = [];

/** Strip at each side of the board that scrolls it while a card is dragged. */
const BOARD_EDGE_ZONE_PX = 80;
const BOARD_EDGE_MIN_SPEED = 4;
const BOARD_EDGE_MAX_SPEED = 28;

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

  // Board-only quick filters: transient, so they reset when the board closes.
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  useBoardScopeLifecycle(workspaceId);
  const columns = useBoardColumns({ search, overdueOnly });

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const assigneeById = useMemo(() => new Map(assignees.map((person) => [person.id, person])), [assignees]);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropStatusId, setDropStatusId] = useState<string | null>(null);

  // Edge auto-scroll while a card is dragged: with many statuses the target
  // column may be off screen. dragover fires continuously, even with the mouse
  // at rest, so it only records the pointer; a rAF loop applies the speed (the
  // same ramp the timeline bars use) until the drag ends.
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragPointerXRef = useRef<number | null>(null);
  useEffect(() => {
    if (!draggingTaskId) return undefined;
    let frame = 0;
    const step = () => {
      const container = boardScrollRef.current;
      const pointerX = dragPointerXRef.current;
      if (container && pointerX !== null) {
        const rect = container.getBoundingClientRect();
        const velocity = getEdgeScrollVelocity(
          pointerX,
          { left: rect.left, right: rect.right },
          BOARD_EDGE_ZONE_PX,
          BOARD_EDGE_MIN_SPEED,
          BOARD_EDGE_MAX_SPEED,
        );
        if (velocity !== 0) container.scrollLeft += velocity;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      dragPointerXRef.current = null;
    };
  }, [draggingTaskId]);

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
    <div className="flex h-full flex-col">
      <BoardQuickFilters
        search={search}
        onSearchChange={setSearch}
        overdueOnly={overdueOnly}
        onOverdueOnlyChange={setOverdueOnly}
      />
      <div
        ref={boardScrollRef}
        onDragOverCapture={(event) => {
          if (draggingTaskId) dragPointerXRef.current = event.clientX;
        }}
        className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4"
        data-testid="planner-board"
      >
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
    </div>
  );
};
