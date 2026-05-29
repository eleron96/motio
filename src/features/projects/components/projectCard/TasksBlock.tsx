import React from 'react';
import { t } from '@lingui/macro';
import { Calendar, Plus, RefreshCcw, Repeat, Search } from 'lucide-react';
import type {
  Assignee,
  Status,
  Task,
} from '@/features/planner/types/planner';
import type { TaskScope } from '@/shared/domain/taskScope';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import {
  formatRepeatCadenceLabel,
  formatRepeatSeriesRemainderLabel,
} from '@/shared/lib/repeatLabels';

type DisplayTaskRow = {
  key: string;
  task: Task;
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

interface TasksBlockProps {
  taskScope: TaskScope;
  onChangeTaskScope: (scope: TaskScope) => void;

  search: string;
  onSearchChange: (value: string) => void;

  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (id: string) => void;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  statusFilterLabel: string;

  assigneeOptions: Assignee[];
  assigneeFilterIds: string[];
  onToggleAssignee: (id: string) => void;
  assigneeFilterLabel: string;

  onClearFilters: () => void;
  onRefreshTasks: () => void;
  tasksLoading: boolean;
  tasksError: string;

  displayTaskRows: DisplayTaskRow[];
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  onSelectTask: (taskId: string) => void;

  /** Past-scope pagination — only shown when scope === 'past'. */
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;

  totalCount: number;

  /** Show the "Add task" button (gated by edit permission). */
  canEdit?: boolean;
  onAddTask?: () => void;
}

export const TasksBlock: React.FC<TasksBlockProps> = ({
  taskScope, onChangeTaskScope,
  search, onSearchChange,
  statuses, statusFilterIds, onToggleStatus, setStatusPreset, statusFilterLabel,
  assigneeOptions, assigneeFilterIds, onToggleAssignee, assigneeFilterLabel,
  onClearFilters, onRefreshTasks, tasksLoading, tasksError,
  displayTaskRows, statusById, assigneeById, onSelectTask,
  pageIndex, totalPages, onPrevPage, onNextPage, totalCount,
  canEdit = false, onAddTask,
}) => {
  return (
    <section className="flex max-h-[520px] min-h-[320px] flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Tasks`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {totalCount}
        </span>
        {canEdit && onAddTask && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={onAddTask}
          >
            <Plus className="h-3.5 w-3.5" />
            {t`Add task`}
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t`Search tasks...`}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <SegmentedControl surface="filled">
          <SegmentedControlItem
            active={taskScope === 'current'}
            onClick={() => onChangeTaskScope('current')}
          >
            {t`Current`}
          </SegmentedControlItem>
          <SegmentedControlItem
            active={taskScope === 'past'}
            onClick={() => onChangeTaskScope('past')}
          >
            {t`Past`}
          </SegmentedControlItem>
        </SegmentedControl>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">{statusFilterLabel}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="flex gap-2 pb-2">
              <Button size="sm" variant="ghost" onClick={() => setStatusPreset('all')}>{t`All`}</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatusPreset('open')}>{t`Open`}</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatusPreset('done')}>{t`Done`}</Button>
            </div>
            <ScrollArea className="max-h-48 pr-2">
              <div className="space-y-1">
                {statuses.map((status) => (
                  <label key={status.id} className="flex cursor-pointer items-center gap-2 py-1">
                    <Checkbox
                      checked={statusFilterIds.includes(status.id)}
                      onCheckedChange={() => onToggleStatus(status.id)}
                    />
                    <span className="truncate text-sm">{formatStatusLabel(status.name, status.emoji)}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">{assigneeFilterLabel}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <ScrollArea className="max-h-48 pr-2">
              <div className="space-y-1">
                {assigneeOptions.length === 0 && (
                  <div className="text-xs text-muted-foreground">{t`No assignees on this project.`}</div>
                )}
                {assigneeOptions.map((assignee) => (
                  <label key={assignee.id} className="flex cursor-pointer items-center gap-2 py-1">
                    <Checkbox
                      checked={assigneeFilterIds.includes(assignee.id)}
                      onCheckedChange={() => onToggleAssignee(assignee.id)}
                    />
                    <span className="truncate text-sm">
                      {assignee.name}
                      {!assignee.isActive && (
                        <span className="ml-1 text-[10px] text-muted-foreground">{t`(disabled)`}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="sm" onClick={onClearFilters}>{t`Clear filters`}</Button>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-2"
          onClick={onRefreshTasks}
          disabled={tasksLoading}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          {t`Refresh`}
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        {tasksLoading && (
          <div className="text-sm text-muted-foreground">{t`Loading tasks...`}</div>
        )}
        {!tasksLoading && tasksError && (
          <div className="text-sm text-destructive">{tasksError}</div>
        )}
        {!tasksLoading && !tasksError && displayTaskRows.length === 0 && (
          <div className="text-sm text-muted-foreground">{t`No tasks match the current filters.`}</div>
        )}
        {!tasksLoading && !tasksError && displayTaskRows.length > 0 && (
          <ul className="flex flex-col">
            {displayTaskRows.map((row) => {
              const { task } = row;
              const status = statusById.get(task.statusId);
              const assigneeNames = task.assigneeIds
                .map((id) => assigneeById.get(id)?.name)
                .filter((name): name is string => Boolean(name));

              return (
                <li
                  key={row.key}
                  className="border-b border-border/50 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => onSelectTask(task.id)}
                    className="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div
                      className={
                        status?.isFinal || status?.isCancelled
                          ? 'mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 border-primary bg-primary'
                          : 'mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 border-border'
                      }
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        {row.repeatMeta && (
                          <Repeat
                            className="mt-1 h-3 w-3 flex-shrink-0 text-primary/70"
                            aria-label={formatRepeatCadenceLabel(row.repeatMeta.cadence)}
                          />
                        )}
                        <div className="text-ui-sm font-medium leading-snug break-words [overflow-wrap:anywhere]">
                          {task.title}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                        {status && (
                          <Badge variant="secondary" className="text-[10px]">
                            {formatStatusLabel(status.name, status.emoji)}
                          </Badge>
                        )}
                        {row.repeatMeta && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            title={formatRepeatSeriesRemainderLabel(row.repeatMeta.remaining)}
                          >
                            {formatRepeatCadenceLabel(row.repeatMeta.cadence)}
                          </Badge>
                        )}
                        {assigneeNames.length > 0 && (
                          <>
                            <span className="text-muted-foreground/60">·</span>
                            <span className="truncate">{assigneeNames.join(', ')}</span>
                          </>
                        )}
                        <span className="text-muted-foreground/60">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Calendar className="h-3 w-3" />
                          {task.endDate}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {taskScope === 'past' && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-ui-xs text-muted-foreground">
          <span>
            {t`Page ${pageIndex} of ${totalPages}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onPrevPage} disabled={pageIndex <= 1}>
              {t`Prev`}
            </Button>
            <Button variant="outline" size="sm" onClick={onNextPage} disabled={pageIndex >= totalPages}>
              {t`Next`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
