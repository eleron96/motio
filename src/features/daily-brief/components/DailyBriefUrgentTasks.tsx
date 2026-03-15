import { t } from '@lingui/macro';
import { differenceInCalendarDays, format } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import type { Task } from '@/features/planner/types/planner';

type Props = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
};

const getOverdueBadge = (endDate: string): { label: string; className: string } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  const diff = differenceInCalendarDays(today, end);

  if (diff === 0) {
    return {
      label: t`Today`,
      className: 'text-warning font-medium',
    };
  }
  return {
    label: t`Overdue by ${diff}d`,
    className: 'text-destructive font-medium',
  };
};

export const DailyBriefUrgentTasks = ({ tasks, onTaskClick }: Props) => {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-1">
        {t`No urgent tasks. Great job!`}
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {tasks.map((task) => {
        const badge = getOverdueBadge(task.endDate);
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onTaskClick(task.id)}
              className="w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm bg-muted hover:bg-accent transition-colors text-left"
            >
              <span className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{task.title}</span>
              </span>
              <span className={`shrink-0 text-xs ${badge.className}`}>
                {badge.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
