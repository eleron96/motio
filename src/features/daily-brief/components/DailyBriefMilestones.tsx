import { useMemo } from 'react';
import { t } from '@lingui/macro';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Flag } from 'lucide-react';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import type { Milestone, Project } from '@/features/planner/types/planner';
import { reveal, rowDelay } from '../lib/dailyBriefReveal';

type Props = {
  milestones: Milestone[];
  projects: Project[];
  baseDelay: number;
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

export const DailyBriefMilestones = ({ milestones, projects, baseDelay }: Props) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const dateToken = locale === 'ru' ? 'EEEEEE, d MMMM' : 'EEE, MMM d';

  if (milestones.length === 0) {
    return (
      <p {...reveal(baseDelay, 'py-1 text-sm text-muted-foreground')}>
        {t`No upcoming milestones in the next 7 days.`}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {milestones.map((milestone, index) => {
        const project = projects.find((p) => p.id === milestone.projectId);

        return (
          <li key={milestone.id}>
            <div
              {...reveal(
                rowDelay(baseDelay, index, true),
                'flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Flag className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate text-foreground">{milestone.title}</span>
                {project && (
                  <span
                    className="shrink-0 truncate text-xs text-muted-foreground max-w-[120px]"
                    style={{ color: project.color }}
                  >
                    {project.name}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-medium text-foreground">
                  {getDaysLabel(milestone.date)}
                </span>
                <span className="block text-ui-2xs text-muted-foreground">
                  {format(parseISO(milestone.date), dateToken, { locale: dateLocale })}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
