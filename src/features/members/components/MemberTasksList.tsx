import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import type { Project, Status, Task } from '@/features/planner/types/planner';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatRepeatCadenceLabel, formatRepeatSeriesRemainderLabel } from '@/shared/lib/repeatLabels';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';

/** A list row: one task, or one repeat series collapsed into its next occurrence. */
export type DisplayTaskRow = {
  key: string;
  task: Task;
  taskIds: string[];
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

type CheckState = boolean | 'indeterminate';

interface MemberTasksListProps {
  rows: DisplayTaskRow[];
  isMobile: boolean;
  statusById: Map<string, Status>;
  projectById: Map<string, Project>;
  selectedTaskIds: Set<string>;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleAll: (value: CheckState) => void;
  onSelectTask: (taskId: string) => void;
  onToggleTask: (taskIds: string[], value: CheckState) => void;
}

/** A series row is checked when all its tasks are, half-checked when some are. */
const rowCheckState = (row: DisplayTaskRow, selectedTaskIds: Set<string>): CheckState => {
  const selectedInRow = row.taskIds.filter((taskId) => selectedTaskIds.has(taskId)).length;
  if (selectedInRow === row.taskIds.length) return true;
  return selectedInRow > 0 ? 'indeterminate' : false;
};

const formatTaskDates = (task: Task) => (
  `${format(parseISO(task.startDate), 'dd MMM yyyy')} – ${format(parseISO(task.endDate), 'dd MMM yyyy')}`
);

const RepeatMeta = ({ meta }: { meta: NonNullable<DisplayTaskRow['repeatMeta']> }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="outline" className="text-[10px]">
      {formatRepeatCadenceLabel(meta.cadence)}
    </Badge>
    <span className="text-xs text-muted-foreground">
      {formatRepeatSeriesRemainderLabel(meta.remaining)}
    </span>
  </div>
);

const ProjectDot = ({ project }: { project: Project }) => (
  <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
);

const ArchivedBadge = () => (
  <Badge variant="secondary" className="text-[10px]">{t`Archived`}</Badge>
);

/** The member's tasks: cards on a phone, a table with a select-all box on a desktop. */
export const MemberTasksList = ({
  rows,
  isMobile,
  statusById,
  projectById,
  selectedTaskIds,
  allVisibleSelected,
  someVisibleSelected,
  onToggleAll,
  onSelectTask,
  onToggleTask,
}: MemberTasksListProps) => {
  if (isMobile) {
    return (
      <div className="space-y-3">
        {rows.map((row) => {
          const { task } = row;
          const status = statusById.get(task.statusId);
          const project = task.projectId ? projectById.get(task.projectId) : null;
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
                    checked={rowCheckState(row, selectedTaskIds)}
                    onCheckedChange={(value) => onToggleTask(row.taskIds, value as CheckState)}
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
                    {row.repeatMeta && <RepeatMeta meta={row.repeatMeta} />}
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <div>
                      {status ? formatStatusLabel(status.name, status.emoji) : t`Unknown`}
                    </div>
                    <div className="flex items-center gap-2">
                      {project ? (
                        <>
                          <ProjectDot project={project} />
                          <span className="break-words [overflow-wrap:anywhere]">
                            {formatProjectLabel(project.name, project.code)}
                          </span>
                          {project.archived && <ArchivedBadge />}
                        </>
                      ) : (
                        <span>{t`No project`}</span>
                      )}
                    </div>
                    <div>{formatTaskDates(task)}</div>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
              onCheckedChange={(value) => onToggleAll(value as CheckState)}
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
        {rows.map((row) => {
          const { task } = row;
          const status = statusById.get(task.statusId);
          const project = task.projectId ? projectById.get(task.projectId) : null;
          return (
            <TableRow
              key={row.key}
              className="cursor-pointer"
              onClick={() => onSelectTask(task.id)}
            >
              <TableCell onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={rowCheckState(row, selectedTaskIds)}
                  onCheckedChange={(value) => onToggleTask(row.taskIds, value as CheckState)}
                  aria-label={t`Select task ${task.title}`}
                />
              </TableCell>
              <TableCell className="font-medium">
                <div className="space-y-1">
                  <div>{task.title}</div>
                  {row.repeatMeta && <RepeatMeta meta={row.repeatMeta} />}
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
                    <ProjectDot project={project} />
                    <span>{formatProjectLabel(project.name, project.code)}</span>
                    {project.archived && <ArchivedBadge />}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{t`No project`}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatTaskDates(task)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
