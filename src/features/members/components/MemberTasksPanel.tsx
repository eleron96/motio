import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { RefreshCcw } from 'lucide-react';
import { Assignee, Project, Status, Task } from '@/features/planner/types/planner';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatRepeatCadenceLabel, formatRepeatSeriesRemainderLabel } from '@/shared/lib/repeatLabels';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';

type DisplayTaskRow = {
  key: string;
  task: Task;
  taskIds: string[];
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

type PastSort = 'start_desc' | 'start_asc' | 'end_desc' | 'end_asc' | 'title_asc' | 'title_desc';

type MemberTasksPanelProps = {
  selectedAssignee: Assignee | null;
  taskScope: 'current' | 'past';
  onChangeTaskScope: (scope: 'current' | 'past') => void;
  memberTaskCountsDate: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilterLabel: string;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (statusId: string) => void;
  projectFilterLabel: string;
  projectOptions: Project[];
  projectFilterIds: string[];
  onToggleProject: (projectId: string) => void;
  pastFromDate: string;
  onPastFromDateChange: (value: string) => void;
  pastToDate: string;
  onPastToDateChange: (value: string) => void;
  pastSort: PastSort;
  onPastSortChange: (value: PastSort) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  selectedAssigneeId: string | null;
  tasksLoading: boolean;
  selectedCount: number;
  onDeleteSelected: () => void;
  tasksError: string;
  displayTaskRows: DisplayTaskRow[];
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleAll: (value: boolean | 'indeterminate') => void;
  statusById: Map<string, Status>;
  projectById: Map<string, Project>;
  selectedTaskIds: Set<string>;
  onSelectTask: (taskId: string) => void;
  onToggleTask: (taskIds: string[], value: boolean | 'indeterminate') => void;
  taskScopePageSize: number;
  displayTotalCount: number;
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export const MemberTasksPanel = ({
  selectedAssignee,
  taskScope,
  onChangeTaskScope,
  memberTaskCountsDate,
  search,
  onSearchChange,
  statusFilterLabel,
  setStatusPreset,
  statuses,
  statusFilterIds,
  onToggleStatus,
  projectFilterLabel,
  projectOptions,
  projectFilterIds,
  onToggleProject,
  pastFromDate,
  onPastFromDateChange,
  pastToDate,
  onPastToDateChange,
  pastSort,
  onPastSortChange,
  onClearFilters,
  onRefresh,
  selectedAssigneeId,
  tasksLoading,
  selectedCount,
  onDeleteSelected,
  tasksError,
  displayTaskRows,
  allVisibleSelected,
  someVisibleSelected,
  onToggleAll,
  statusById,
  projectById,
  selectedTaskIds,
  onSelectTask,
  onToggleTask,
  taskScopePageSize,
  displayTotalCount,
  pageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
}: MemberTasksPanelProps) => {
  return (
    <>
      {!selectedAssignee && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t`Select a member to view details.`}
        </div>
      )}

      {selectedAssignee && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold">{selectedAssignee.name}</div>
                  {!selectedAssignee.isActive && (
                    <Badge variant="secondary">{t`Disabled`}</Badge>
                  )}
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChangeTaskScope('current')}
                    className={`h-7 px-3 text-xs rounded-md ${
                      taskScope === 'current' ? 'bg-foreground text-background shadow-sm' : ''
                    }`}
                  >
                    {t`Current`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChangeTaskScope('past')}
                    className={`h-7 px-3 text-xs rounded-md ${
                      taskScope === 'past' ? 'bg-foreground text-background shadow-sm' : ''
                    }`}
                  >
                    {t`Past`}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {memberTaskCountsDate ? t`Tasks from today` : t`Tasks count loading...`}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-border">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                className="w-[220px]"
                placeholder={t`Search tasks...`}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">{statusFilterLabel}</Button>
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
                        <label key={status.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={statusFilterIds.includes(status.id)}
                            onCheckedChange={() => onToggleStatus(status.id)}
                          />
                          <span className="text-sm truncate">{formatStatusLabel(status.name, status.emoji)}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">{projectFilterLabel}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <ScrollArea className="max-h-48 pr-2">
                    <div className="space-y-1">
                      {projectOptions.length === 0 && (
                        <div className="text-xs text-muted-foreground">{t`No projects for this member.`}</div>
                      )}
                      {projectOptions.map((project) => (
                        <label key={project.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={projectFilterIds.includes(project.id)}
                            onCheckedChange={() => onToggleProject(project.id)}
                          />
                          <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                          <span className="text-sm truncate">
                            {formatProjectLabel(project.name, project.code)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              {taskScope === 'past' && (
                <>
                  <Input
                    type="date"
                    className="w-[160px]"
                    value={pastFromDate}
                    onChange={(event) => onPastFromDateChange(event.target.value)}
                  />
                  <Input
                    type="date"
                    className="w-[160px]"
                    value={pastToDate}
                    onChange={(event) => onPastToDateChange(event.target.value)}
                  />
                  <Select value={pastSort} onValueChange={(value) => onPastSortChange(value as PastSort)}>
                    <SelectTrigger className="w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="end_desc">{t`End date ↓`}</SelectItem>
                      <SelectItem value="end_asc">{t`End date ↑`}</SelectItem>
                      <SelectItem value="start_desc">{t`Start date ↓`}</SelectItem>
                      <SelectItem value="start_asc">{t`Start date ↑`}</SelectItem>
                      <SelectItem value="title_asc">{t`Title A–Z`}</SelectItem>
                      <SelectItem value="title_desc">{t`Title Z–A`}</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}

              <Button variant="ghost" onClick={onClearFilters}>
                {t`Clear filters`}
              </Button>

              <Button
                variant="ghost"
                className="ml-auto"
                onClick={onRefresh}
                disabled={!selectedAssigneeId || tasksLoading}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {t`Refresh`}
              </Button>
              {selectedCount > 0 && (
                <Button
                  variant="destructive"
                  onClick={onDeleteSelected}
                  disabled={tasksLoading}
                >
                  {t`Delete selected (${selectedCount})`}
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {tasksLoading && (
              <div className="text-sm text-muted-foreground">{t`Loading tasks...`}</div>
            )}
            {!tasksLoading && tasksError && (
              <div className="text-sm text-destructive">{tasksError}</div>
            )}
            {!tasksLoading && !tasksError && (
              <>
                {displayTaskRows.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t`No tasks match the current filters.`}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                            onCheckedChange={(value) => onToggleAll(value as boolean | 'indeterminate')}
                            aria-label={t`Select all tasks`}
                          />
                        </TableHead>
                        <TableHead>{t`Task`}</TableHead>
                        <TableHead>{t`Status`}</TableHead>
                        <TableHead>{t`Project`}</TableHead>
                        <TableHead>{t`Dates`}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayTaskRows.map((row) => {
                        const { task } = row;
                        const status = statusById.get(task.statusId);
                        const project = task.projectId ? projectById.get(task.projectId) : null;
                        const selectedInRow = row.taskIds.filter((taskId) => selectedTaskIds.has(taskId)).length;
                        const rowChecked: boolean | 'indeterminate' = (
                          selectedInRow === row.taskIds.length
                            ? true
                            : selectedInRow > 0
                              ? 'indeterminate'
                              : false
                        );
                        return (
                          <TableRow
                            key={row.key}
                            className="cursor-pointer"
                            onClick={() => onSelectTask(task.id)}
                          >
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                checked={rowChecked}
                                onCheckedChange={(value) => onToggleTask(row.taskIds, value as boolean | 'indeterminate')}
                                aria-label={t`Select task ${task.title}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="space-y-1">
                                <div>{task.title}</div>
                                {row.repeatMeta && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">
                                      {formatRepeatCadenceLabel(row.repeatMeta.cadence)}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {formatRepeatSeriesRemainderLabel(row.repeatMeta.remaining)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {status ? formatStatusLabel(status.name, status.emoji) : t`Unknown`}
                              </div>
                            </TableCell>
                            <TableCell>
                              {project ? (
                                <div className="flex items-center gap-2 text-sm">
                                  <span
                                    className="inline-flex h-2 w-2 rounded-full"
                                    style={{ backgroundColor: project.color }}
                                  />
                                  <span>{formatProjectLabel(project.name, project.code)}</span>
                                  {project.archived && (
                                    <Badge variant="secondary" className="text-[10px]">{t`Archived`}</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">{t`No project`}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(parseISO(task.startDate), 'dd MMM yyyy')} – {format(parseISO(task.endDate), 'dd MMM yyyy')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {taskScope === 'past' && displayTotalCount > taskScopePageSize && (
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {Math.min(displayTotalCount, (pageIndex - 1) * taskScopePageSize + 1)}–
                      {Math.min(displayTotalCount, pageIndex * taskScopePageSize)} {t`of`} {displayTotalCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onPrevPage}
                        disabled={pageIndex === 1}
                      >
                        {t`Prev`}
                      </Button>
                      <span>
                        {t`Page ${pageIndex} / ${totalPages}`}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onNextPage}
                        disabled={pageIndex >= totalPages}
                      >
                        {t`Next`}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
