import { useState, type ReactNode } from 'react';
import { plural, t } from '@lingui/macro';
import type { Task } from '@/features/planner/types/planner';
import { reveal, rowDelay } from '../lib/dailyBriefReveal';

/** Rows shown before the list collapses into an "N more" toggle. */
const COLLAPSED_LIMIT = 3;

type Props = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
  /** Right-hand label: days overdue, project name, whatever the section needs. */
  renderMeta: (task: Task) => ReactNode;
  emptyLabel: string;
  baseDelay: number;
};

export const DailyBriefTaskList = ({
  tasks,
  onTaskClick,
  renderMeta,
  emptyLabel,
  baseDelay,
}: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) {
    return (
      <p {...reveal(baseDelay, 'py-1 text-sm text-muted-foreground')}>
        {emptyLabel}
      </p>
    );
  }

  const visible = expanded ? tasks : tasks.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = tasks.length - visible.length;

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {visible.map((task, index) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onTaskClick(task.id)}
              // Rows revealed by expanding appear at once; only the initial
              // batch is staggered, so expanding never feels laggy.
              {...reveal(
                rowDelay(baseDelay, index, index < COLLAPSED_LIMIT),
                'flex w-full items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
              )}
            >
              <span className="truncate text-foreground">{task.title}</span>
              <span className="shrink-0 text-xs">{renderMeta(task)}</span>
            </button>
          </li>
        ))}
      </ul>

      {(hiddenCount > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          // Delay stays fixed across toggles: changing animation-delay on a
          // mounted element re-runs the reveal and makes the toggle flicker.
          {...reveal(
            rowDelay(baseDelay, COLLAPSED_LIMIT, true),
            'self-start rounded-sm px-3 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground',
          )}
        >
          {expanded
            ? t`Collapse`
            : plural(hiddenCount, { one: 'and # more', other: 'and # more' })}
        </button>
      )}
    </div>
  );
};
