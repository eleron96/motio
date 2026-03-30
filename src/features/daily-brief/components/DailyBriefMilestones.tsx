import { t } from '@lingui/macro';
import { differenceInCalendarDays } from 'date-fns';
import { Flag } from 'lucide-react';
import type { Milestone, Project } from '@/features/planner/types/planner';

type Props = {
  milestones: Milestone[];
  projects: Project[];
};

const getDaysLabel = (date: string): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  const diff = differenceInCalendarDays(target, today);

  if (diff === 0) return t`Today`;
  if (diff === 1) return t`Tomorrow`;
  return t`In ${diff} days`;
};

export const DailyBriefMilestones = ({ milestones, projects }: Props) => {
  if (milestones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-1">
        {t`No upcoming milestones in the next 7 days.`}
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {milestones.map((milestone) => {
        const project = projects.find((p) => p.id === milestone.projectId);
        const daysLabel = getDaysLabel(milestone.date);

        return (
          <li key={milestone.id}>
            <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm bg-muted">
              <span className="flex items-center gap-2 min-w-0">
                <Flag className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate text-foreground">{milestone.title}</span>
                {project && (
                  <span
                    className="shrink-0 text-xs text-muted-foreground truncate max-w-[120px]"
                    style={{ color: project.color }}
                  >
                    {project.name}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                {daysLabel}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
