import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { CalendarDays, RefreshCcw } from 'lucide-react';
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
import { Assignee, Customer, Milestone, Project, Status, Task } from '@/features/planner/types/planner';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import type { PastTaskSort, TaskScope } from '@/shared/domain/taskScope';
import { useIsMobile } from '@/shared/hooks/use-mobile';

type DisplayTaskRow = {
  key: string;
  task: Task;
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

type ProjectsMainPanelProps = {
  mode: 'projects' | 'milestones' | 'customers';
  selectedProject: Project | null;
  customerById: Map<string, Customer>;
  taskScope: TaskScope;
  onChangeTaskScope: (scope: TaskScope) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilterLabel: string;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (statusId: string) => void;
  assigneeFilterLabel: string;
  assigneeOptions: Assignee[];
  assigneeFilterIds: string[];
  onToggleAssignee: (assigneeId: string) => void;
  pastFromDate: string;
  onPastFromDateChange: (value: string) => void;
  pastToDate: string;
  onPastToDateChange: (value: string) => void;
  pastSort: PastTaskSort;
  onPastSortChange: (value: PastTaskSort) => void;
  onClearFilters: () => void;
  selectedProjectId: string | null;
  onRefreshTasks: () => void;
  tasksLoading: boolean;
  tasksError: string;
  displayTaskRows: DisplayTaskRow[];
  taskScopePageSize: number;
  displayTotalCount: number;
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  onSelectTask: (taskId: string) => void;
  selectedMilestone: Milestone | null;
  selectedMilestoneProject: Project | null;
  selectedMilestoneCustomer: Customer | null;
  formatMilestoneDate: (date: string) => string;
  trackedProjectIdSet: Set<string>;
  onOpenProjectFromMilestone: (milestone: Milestone) => void;
  onOpenMilestoneSettings: (milestone: Milestone) => void;
  onRequestDeleteMilestone: (milestone: Milestone) => void;
  canEdit: boolean;
  selectedCustomer: Customer | null;
  selectedCustomerProjects: Project[];
  customersCount: number;
  onOpenProjectFromCustomer: (project: Project) => void;
};

export const ProjectsMainPanel = ({
  mode,
  selectedProject,
  customerById,
  taskScope,
  onChangeTaskScope,
  search,
  onSearchChange,
  statusFilterLabel,
  setStatusPreset,
  statuses,
  statusFilterIds,
  onToggleStatus,
  assigneeFilterLabel,
  assigneeOptions,
  assigneeFilterIds,
  onToggleAssignee,
  pastFromDate,
  onPastFromDateChange,
  pastToDate,
  onPastToDateChange,
  pastSort,
  onPastSortChange,
  onClearFilters,
  selectedProjectId,
  onRefreshTasks,
  tasksLoading,
  tasksError,
  displayTaskRows,
  taskScopePageSize,
  displayTotalCount,
  pageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
  statusById,
  assigneeById,
  onSelectTask,
  selectedMilestone,
  selectedMilestoneProject,
  selectedMilestoneCustomer,
  formatMilestoneDate,
  trackedProjectIdSet,
  onOpenProjectFromMilestone,
  onOpenMilestoneSettings,
  onRequestDeleteMilestone,
  canEdit,
  selectedCustomer,
  selectedCustomerProjects,
  customersCount,
  onOpenProjectFromCustomer,
}: ProjectsMainPanelProps) => {
  const isMobile = useIsMobile();
  const sectionPadding = isMobile ? 'px-4 py-3' : 'px-6 py-4';

  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col">
      {mode === 'projects' ? (
        <>
          {!selectedProject && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t`Select a project to view details.`}
            </div>
          )}

          {selectedProject && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className={`border-b border-border ${sectionPadding}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">
                          {formatProjectLabel(selectedProject.name, selectedProject.code)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {customerById.get(selectedProject.customerId ?? '')?.name ?? t`No customer`}
                        </div>
                      </div>
                      {selectedProject.archived && (
                        <Badge variant="secondary">{t`Archived`}</Badge>
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
                </div>
              </div>

              <div className={`border-b border-border ${sectionPadding}`}>
                <div className={isMobile ? 'flex flex-col items-stretch gap-2' : 'flex flex-wrap items-center gap-3'}>
                  <Input
                    className="w-full sm:w-[220px]"
                    placeholder={t`Search tasks...`}
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={isMobile ? 'w-full justify-between' : undefined}>
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
                      <Button variant="outline" className={isMobile ? 'w-full justify-between' : undefined}>
                        {assigneeFilterLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <ScrollArea className="max-h-48 pr-2">
                        <div className="space-y-1">
                          {assigneeOptions.length === 0 && (
                            <div className="text-xs text-muted-foreground">{t`No assignees on this project.`}</div>
                          )}
                          {assigneeOptions.map((assignee) => (
                            <label key={assignee.id} className="flex items-center gap-2 py-1 cursor-pointer">
                              <Checkbox
                                checked={assigneeFilterIds.includes(assignee.id)}
                                onCheckedChange={() => onToggleAssignee(assignee.id)}
                              />
                              <span className="text-sm truncate">
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

                  <Button variant="ghost" className={isMobile ? 'w-full justify-center' : undefined} onClick={onClearFilters}>
                    {t`Clear filters`}
                  </Button>

                  <Button
                    variant="ghost"
                    className={isMobile ? 'w-full justify-center' : 'ml-auto'}
                    onClick={onRefreshTasks}
                    disabled={!selectedProjectId || tasksLoading}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t`Refresh`}
                  </Button>
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
                          const assigneesList = task.assigneeIds
                            .map((id) => assigneeById.get(id))
                            .filter((assignee): assignee is NonNullable<typeof assignee> => Boolean(assignee));

                          return (
                            <button
                              key={row.key}
                              type="button"
                              className="w-full rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-muted/40"
                              onClick={() => onSelectTask(task.id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
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
                                {status && (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {formatStatusLabel(status.name, status.emoji)}
                                  </Badge>
                                )}
                              </div>

                              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                                <div>
                                  {assigneesList.length === 0 ? (
                                    <span>{t`Unassigned`}</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {assigneesList.map((assignee) => (
                                        <Badge key={assignee.id} variant="secondary" className="text-[10px]">
                                          {assignee.name}
                                          {!assignee.isActive && ` ${t`(disabled)`}`}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  {format(parseISO(task.startDate), 'dd MMM yyyy')} – {format(parseISO(task.endDate), 'dd MMM yyyy')}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t`Task`}</TableHead>
                            <TableHead>{t`Status`}</TableHead>
                            <TableHead>{t`Assignees`}</TableHead>
                            <TableHead>{t`Dates`}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayTaskRows.map((row) => {
                            const { task } = row;
                            const status = statusById.get(task.statusId);
                            const assigneesList = task.assigneeIds
                              .map((id) => assigneeById.get(id))
                              .filter((assignee): assignee is NonNullable<typeof assignee> => Boolean(assignee));
                            return (
                              <TableRow
                                key={row.key}
                                role="button"
                                tabIndex={0}
                                className="cursor-pointer hover:bg-muted/40"
                                onClick={() => onSelectTask(task.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onSelectTask(task.id);
                                  }
                                }}
                              >
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
                                  {assigneesList.length === 0 ? (
                                    <span className="text-xs text-muted-foreground">{t`Unassigned`}</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {assigneesList.map((assignee) => (
                                        <Badge
                                          key={assignee.id}
                                          variant="secondary"
                                          className="text-[10px]"
                                        >
                                          {assignee.name}
                                          {!assignee.isActive && ` ${t`(disabled)`}`}
                                        </Badge>
                                      ))}
                                    </div>
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
      ) : mode === 'milestones' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedMilestone && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t`Select a milestone to view details.`}
            </div>
          )}
          {selectedMilestone && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className={`border-b border-border ${sectionPadding}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <CalendarDays className="mt-1 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">
                        {selectedMilestone.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatMilestoneDate(selectedMilestone.date)}
                      </div>
                      <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                        {selectedMilestoneProject
                          ? formatProjectLabel(selectedMilestoneProject.name, selectedMilestoneProject.code)
                          : t`Unknown project`}
                      </div>
                    </div>
                    {selectedMilestoneProject?.archived && (
                      <Badge variant="secondary">{t`Archived`}</Badge>
                    )}
                  </div>
                  <div className={isMobile ? 'flex w-full flex-col gap-2' : 'flex items-center gap-2'}>
                    <Button
                      variant="outline"
                      className={isMobile ? 'w-full' : undefined}
                      onClick={() => onOpenProjectFromMilestone(selectedMilestone)}
                      disabled={!selectedMilestoneProject}
                    >
                      {t`Open project`}
                    </Button>
                    <Button
                      variant="outline"
                      className={isMobile ? 'w-full' : undefined}
                      onClick={() => onOpenMilestoneSettings(selectedMilestone)}
                      disabled={!canEdit}
                    >
                      {t`Edit`}
                    </Button>
                    <Button
                      variant="destructive"
                      className={isMobile ? 'w-full' : undefined}
                      onClick={() => onRequestDeleteMilestone(selectedMilestone)}
                      disabled={!canEdit}
                    >
                      {t`Delete`}
                    </Button>
                  </div>
                </div>
              </div>
              <div className={`flex-1 overflow-auto ${sectionPadding}`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Date`}</div>
                    <div className="text-sm">{formatMilestoneDate(selectedMilestone.date)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Project`}</div>
                    <div className="text-sm break-words [overflow-wrap:anywhere]">
                      {selectedMilestoneProject
                        ? formatProjectLabel(selectedMilestoneProject.name, selectedMilestoneProject.code)
                        : t`Unknown project`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Customer`}</div>
                    <div className="text-sm break-words [overflow-wrap:anywhere]">
                      {selectedMilestoneCustomer?.name ?? t`No customer`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Tracking`}</div>
                    <div className="text-sm">
                      {trackedProjectIdSet.has(selectedMilestone.projectId) ? t`Tracked project` : t`Not tracked`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className={`border-b border-border ${sectionPadding}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  {selectedCustomer?.name ?? t`Select a customer`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedCustomer
                    ? t`${selectedCustomerProjects.length} projects`
                    : t`${customersCount} customers`}
                </div>
              </div>
            </div>
          </div>
          <div className={`flex-1 overflow-auto ${sectionPadding}`}>
            {!selectedCustomer && (
              <div className="text-sm text-muted-foreground">{t`Choose a customer to see their projects.`}</div>
            )}
            {selectedCustomer && selectedCustomerProjects.length === 0 && (
              <div className="text-sm text-muted-foreground">{t`No projects assigned to this customer.`}</div>
            )}
            {selectedCustomer && selectedCustomerProjects.length > 0 && (
              <div className="space-y-2">
                {selectedCustomerProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onOpenProjectFromCustomer(project)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                        {formatProjectLabel(project.name, project.code)}
                      </div>
                      {project.archived && (
                        <div className="text-[10px] text-muted-foreground">{t`Archived`}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
