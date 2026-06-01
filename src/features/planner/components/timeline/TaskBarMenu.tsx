import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { Task, TaskPriority } from '@/features/planner/types/planner';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { t } from '@lingui/macro';
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/shared/ui/context-menu';
import { Input } from '@/shared/ui/input';

interface TaskBarMenuProps {
  task: Task;
  canEdit: boolean;
  /** Opens the delete confirmation dialog (owned by the parent TaskBar). */
  onRequestDelete: () => void;
}

/**
 * Context-menu body for a task bar.
 *
 * Rendered as a child of <ContextMenuContent>, so Radix only mounts it while
 * the menu is actually open. All the heavy store subscriptions and list
 * computations (project list sorting/filtering, status list, etc.) live here
 * instead of in TaskBar, so they no longer run for every visible bar on every
 * render — only for the single bar whose menu is open.
 */
const TaskBarMenuBase: React.FC<TaskBarMenuProps> = ({ task, canEdit, onRequestDelete }) => {
  const projects = usePlannerStore((state) => state.projects);
  const trackedProjectIds = usePlannerStore((state) => state.trackedProjectIds);
  const statuses = usePlannerStore((state) => state.statuses);
  const groupMode = usePlannerStore((state) => state.groupMode);
  const updateTask = usePlannerStore((state) => state.updateTask);
  const duplicateTask = usePlannerStore((state) => state.duplicateTask);

  const [projectSubOpen, setProjectSubOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null);

  const project = projects.find((p) => p.id === task.projectId);
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((item) => !item.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const archivedProject = project?.archived ? project : null;
  const projectOptions = useMemo(() => {
    if (!archivedProject) return activeProjects;
    return [archivedProject, ...activeProjects.filter((item) => item.id !== archivedProject.id)];
  }, [activeProjects, archivedProject]);

  const filteredProjectOptions = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projectOptions;
    return projectOptions.filter((item) => {
      const name = item.name?.toLowerCase() ?? '';
      const code = item.code?.toLowerCase() ?? '';
      return name.includes(query) || code.includes(query);
    });
  }, [projectOptions, projectQuery]);

  useEffect(() => {
    if (!projectSubOpen) setProjectQuery('');
  }, [projectSubOpen]);

  const noProjectDisabled = groupMode === 'project';
  const projectValue = task.projectId ?? 'none';
  const priorityValue = task.priority ?? 'none';

  const priorityLabels: Record<TaskPriority, string> = {
    low: t`Low priority`,
    medium: t`Medium priority`,
    high: t`High priority`,
  };

  const handleStatusChange = (statusId: string) => {
    if (!canEdit || statusId === task.statusId) return;
    updateTask(task.id, { statusId });
  };

  const handleProjectChange = (projectId: string) => {
    if (!canEdit) return;
    if (noProjectDisabled && projectId === 'none') return;
    const nextProjectId = projectId === 'none' ? null : projectId;
    if (nextProjectId === task.projectId) return;
    updateTask(task.id, { projectId: nextProjectId });
  };

  const handlePriorityChange = (value: string) => {
    if (!canEdit) return;
    const nextPriority: TaskPriority | null = value === 'none'
      ? null
      : (value as TaskPriority);
    if (nextPriority === (task.priority ?? null)) return;
    updateTask(task.id, { priority: nextPriority });
  };

  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger className="py-1 text-xs">{t`Status`}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuLabel className="px-2 py-1 text-xs">{t`Status`}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuRadioGroup value={task.statusId} onValueChange={handleStatusChange}>
            {statuses.map((item) => (
              <ContextMenuRadioItem key={item.id} value={item.id} disabled={!canEdit} className="py-1 pl-7 text-xs">
                {formatStatusLabel(item.name, item.emoji)}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => duplicateTask(task.id)} disabled={!canEdit} className="py-1 text-xs">
        {t`Duplicate task`}
      </ContextMenuItem>
      <ContextMenuSub open={projectSubOpen} onOpenChange={setProjectSubOpen}>
        <ContextMenuSubTrigger className="py-1 text-xs">{t`Assign project`}</ContextMenuSubTrigger>
        <ContextMenuSubContent
          className="w-64 p-1"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              projectSearchInputRef.current?.focus();
              projectSearchInputRef.current?.select();
            });
          }}
        >
          <div className="px-1 pb-1">
            <Input
              ref={projectSearchInputRef}
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              onKeyDown={(event) => {
                // Prevent Radix typeahead/arrow-nav from stealing keystrokes.
                if (event.key !== 'Escape' && event.key !== 'Tab') {
                  event.stopPropagation();
                }
              }}
              placeholder={t`Search projects`}
              className="h-7 text-xs"
            />
          </div>
          <ContextMenuSeparator />
          <div className="max-h-64 overflow-y-auto">
            <ContextMenuRadioGroup value={projectValue} onValueChange={handleProjectChange}>
              <ContextMenuRadioItem
                value="none"
                disabled={!canEdit || noProjectDisabled}
                className="py-1 pl-7 text-xs"
              >
                {t`No project`}
              </ContextMenuRadioItem>
              {filteredProjectOptions.map((item) => (
                <ContextMenuRadioItem
                  key={item.id}
                  value={item.id}
                  disabled={!canEdit}
                  className="py-1 pl-7 text-xs"
                >
                  <span
                    className="mr-1.5 inline-flex h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{formatProjectLabel(item.name, item.code)}</span>
                  {item.archived && (
                    <span className="ml-1 text-[10px] text-muted-foreground">({t`Archived`})</span>
                  )}
                </ContextMenuRadioItem>
              ))}
              {filteredProjectOptions.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t`No matches`}
                </div>
              )}
            </ContextMenuRadioGroup>
          </div>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger className="py-1 text-xs">{t`Priority`}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuLabel className="px-2 py-1 text-xs">{t`Priority`}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuRadioGroup value={priorityValue} onValueChange={handlePriorityChange}>
            <ContextMenuRadioItem value="none" disabled={!canEdit} className="py-1 pl-7 text-xs">
              {t`No priority`}
            </ContextMenuRadioItem>
            <ContextMenuRadioItem value="low" disabled={!canEdit} className="py-1 pl-7 text-xs">
              {priorityLabels.low}
            </ContextMenuRadioItem>
            <ContextMenuRadioItem value="medium" disabled={!canEdit} className="py-1 pl-7 text-xs">
              {priorityLabels.medium}
            </ContextMenuRadioItem>
            <ContextMenuRadioItem value="high" disabled={!canEdit} className="py-1 pl-7 text-xs">
              {priorityLabels.high}
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onRequestDelete} disabled={!canEdit} className="py-1 text-xs text-destructive">
        {t`Delete task`}
      </ContextMenuItem>
    </>
  );
};

export const TaskBarMenu = React.memo(TaskBarMenuBase);
TaskBarMenu.displayName = 'TaskBarMenu';
