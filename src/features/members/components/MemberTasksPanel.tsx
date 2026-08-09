import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { RefreshCcw, SlidersHorizontal } from 'lucide-react';
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
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import type { PastTaskSort, TaskScope } from '@/shared/domain/taskScope';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MemberTasksFiltersScreen } from '@/features/members/components/MemberTasksFiltersScreen';

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

type MemberTasksPanelProps = {
  selectedAssignee: Assignee | null;
  taskScope: TaskScope;
  onChangeTaskScope: (scope: TaskScope) => void;
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
  pastSort: PastTaskSort;
  onPastSortChange: (value: PastTaskSort) => void;
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
  const isMobile = useIsMobile();
  const sectionPadding = isMobile ? 'px-4 py-3' : 'px-6 py-4';
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  // Counted, not just flagged: the button carries the number so you can see
  // how much is filtering the list without opening the screen.
  const activeFilterCount = (search.trim().length > 0 ? 1 : 0)
    + statusFilterIds.length
    + projectFilterIds.length
    + (taskScope === 'past' && pastFromDate.length > 0 ? 1 : 0)
    + (taskScope === 'past' && pastToDate.length > 0 ? 1 : 0);

  return (
    <>
      {!selectedAssignee && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t`Select a person to view details.`}
        </div>
      )}

      {selectedAssignee && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className={`border-b border-border ${sectionPadding}`}>
            <div className={`flex flex-wrap items-center justify-between gap-3 ${isMobile ? 'gap-2' : ''}`}>
              <div className={isMobile ? 'w-full space-y-2' : 'space-y-2'}>
                {/* On a phone the name is already the screen's title; only the
                    "disabled" mark still has to be said. */}
                {isMobile ? (
                  !selectedAssignee.isActive && (
                    <Badge variant="secondary">{t`Disabled`}</Badge>
                  )
                ) : (
                  <div className="flex items-center gap-3">
                    <PersonAvatar
                      assigneeId={selectedAssignee.id}
                      userId={selectedAssignee.userId}
                      name={selectedAssignee.name}
                      avatarUrl={selectedAssignee.avatar}
                      colorSeed={selectedAssignee.userId ?? selectedAssignee.id}
                      size="xl"
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1 truncate text-lg font-semibold">
                      {selectedAssignee.name}
                    </div>
                    {!selectedAssignee.isActive && (
                      <Badge variant="secondary">{t`Disabled`}</Badge>
                    )}
                  </div>
                )}
                <SegmentedControl surface="filled" className={isMobile ? 'w-full' : undefined}>
                  <SegmentedControlItem
                    size={isMobile ? 'touch' : undefined}
                    fullWidth={isMobile}
                    active={taskScope === 'current'}
                    onClick={() => onChangeTaskScope('current')}
                  >
                    {t`Current`}
                  </SegmentedControlItem>
                  <SegmentedControlItem
                    size={isMobile ? 'touch' : undefined}
                    fullWidth={isMobile}
                    active={taskScope === 'past'}
                    onClick={() => onChangeTaskScope('past')}
                  >
                    {t`Past`}
                  </SegmentedControlItem>
                </SegmentedControl>
              </div>
              <div className="text-xs text-muted-foreground">
                {memberTaskCountsDate ? t`Tasks from today` : t`Tasks count loading...`}
              </div>
            </div>
          </div>

          <div className={`border-b border-border ${sectionPadding}`}>
            {isMobile ? (
              // One button instead of an accordion of popovers: everything that
              // used to hide in floating layers now lives on its own screen.
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 justify-between"
                  onClick={() => setMobileFiltersOpen(true)}
                >
                  <span className="inline-flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    {t`Filters`}
                  </span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="tabular-nums">{activeFilterCount}</Badge>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={onRefresh}
                  disabled={!selectedAssigneeId || tasksLoading}
                  aria-label={t`Refresh`}
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            {selectedCount > 0 && isMobile && (
              <Button
                variant="destructive"
                className="mt-2 h-11 w-full justify-center"
                onClick={onDeleteSelected}
                disabled={tasksLoading}
              >
                {t`Delete selected (${selectedCount})`}
              </Button>
            )}
            <div
              className={isMobile ? 'hidden' : 'flex flex-wrap items-center gap-3'}
            >
              <Input
                className="w-full sm:w-[220px]"
                placeholder={t`Search tasks...`}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    {statusFilterLabel}
                  </Button>
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
                  <Button variant="outline">
                    {projectFilterLabel}
                  </Button>
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
                    className="w-full sm:w-[160px]"
                    value={pastFromDate}
                    onChange={(event) => onPastFromDateChange(event.target.value)}
                  />
                  <Input
                    type="date"
                    className="w-full sm:w-[160px]"
                    value={pastToDate}
                    onChange={(event) => onPastToDateChange(event.target.value)}
                  />
                  <Select value={pastSort} onValueChange={(value) => onPastSortChange(value as PastTaskSort)}>
                    <SelectTrigger className="w-full sm:w-[170px]">
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

          <div className={`flex-1 overflow-auto ${sectionPadding}`}>
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
                ) : isMobile ? (
                  <div className="space-y-3">
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
                        <div
                          key={row.key}
                          className="rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="-ml-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Checkbox
                                checked={rowChecked}
                                onCheckedChange={(value) => onToggleTask(row.taskIds, value as boolean | 'indeterminate')}
                                aria-label={t`Select task ${task.title}`}
                                className="h-5 w-5"
                              />
                            </div>
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => onSelectTask(task.id)}
                            >
                              <div className="space-y-1">
                                <div className="text-sm font-medium leading-snug break-words [overflow-wrap:anywhere] line-clamp-2">
                                  {task.title}
                                </div>
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

                              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                                <div>
                                  {status ? formatStatusLabel(status.name, status.emoji) : t`Unknown`}
                                </div>
                                <div className="flex items-center gap-2">
                                  {project ? (
                                    <>
                                      <span
                                        className="inline-flex h-2 w-2 rounded-full"
                                        style={{ backgroundColor: project.color }}
                                      />
                                      <span className="break-words [overflow-wrap:anywhere]">
                                        {formatProjectLabel(project.name, project.code)}
                                      </span>
                                      {project.archived && (
                                        <Badge variant="secondary" className="text-[10px]">{t`Archived`}</Badge>
                                      )}
                                    </>
                                  ) : (
                                    <span>{t`No project`}</span>
                                  )}
                                </div>
                                <div>
                                  {format(parseISO(task.startDate), 'dd MMM yyyy')} – {format(parseISO(task.endDate), 'dd MMM yyyy')}
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                  <div className={`mt-4 text-xs text-muted-foreground ${isMobile ? 'space-y-2' : 'flex items-center justify-between'}`}>
                    <span>
                      {Math.min(displayTotalCount, (pageIndex - 1) * taskScopePageSize + 1)}–
                      {Math.min(displayTotalCount, pageIndex * taskScopePageSize)} {t`of`} {displayTotalCount}
                    </span>
                    <div className={`flex items-center gap-2 ${isMobile ? 'justify-between' : ''}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className={isMobile ? 'h-11 px-5' : undefined}
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
                        className={isMobile ? 'h-11 px-5' : undefined}
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

      {isMobile && (
        <MemberTasksFiltersScreen
          open={mobileFiltersOpen}
          onOpenChange={setMobileFiltersOpen}
          search={search}
          onSearchChange={onSearchChange}
          statuses={statuses}
          statusFilterIds={statusFilterIds}
          onToggleStatus={onToggleStatus}
          setStatusPreset={setStatusPreset}
          projectOptions={projectOptions}
          projectFilterIds={projectFilterIds}
          onToggleProject={onToggleProject}
          taskScope={taskScope}
          pastFromDate={pastFromDate}
          onPastFromDateChange={onPastFromDateChange}
          pastToDate={pastToDate}
          onPastToDateChange={onPastToDateChange}
          pastSort={pastSort}
          onPastSortChange={onPastSortChange}
          onClearFilters={onClearFilters}
        />
      )}
    </>
  );
};
