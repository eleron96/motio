import { useMemo } from 'react';
import { plural, t } from '@lingui/macro';
import { format } from 'date-fns';
import { Skeleton } from '@/shared/ui/skeleton';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDailyBriefData } from '../hooks/useDailyBriefData';
import { getOverdueDays } from '../lib/dailyBriefBuckets';
import { reveal, REVEAL_DELAY } from '../lib/dailyBriefReveal';
import { EasterEggSlot } from '../easter-eggs/EasterEggSlot'; // easter egg — safe to delete
import { DailyBriefStats } from './DailyBriefStats';
import { DailyBriefTaskList } from './DailyBriefTaskList';
import { DailyBriefMilestones } from './DailyBriefMilestones';

type Props = {
  open: boolean;
  onDismiss: () => void;
  workspaceId: string;
  assigneeId: string;
};

type SectionHeadingProps = {
  title: string;
  count?: string;
  delay: number;
};

const SectionHeading = ({ title, count, delay }: SectionHeadingProps) => (
  <div {...reveal(delay, 'flex items-baseline justify-between gap-2.5')}>
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {count && <span className="text-xs text-muted-foreground">{count}</span>}
  </div>
);

const Divider = ({ delay }: { delay: number }) => (
  <div {...reveal(delay, 'h-px bg-border')} />
);

export const DailyBriefModal = ({ open, onDismiss, workspaceId, assigneeId }: Props) => {
  const profileDisplayName = useAuthStore((s) => s.profileDisplayName);
  const projects = usePlannerStore((s) => s.projects);
  const locale = useLocaleStore((s) => s.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);

  const { overdueTasks, todayTasks, upcomingMilestones, todayKey, loading } = useDailyBriefData({
    workspaceId,
    assigneeId,
    enabled: open,
  });

  const displayName = profileDisplayName ?? t`there`;

  const handleTaskClick = (taskId: string) => {
    usePlannerStore.getState().setSelectedTaskId(taskId);
    onDismiss();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
      <DialogContent
        className="sm:max-w-[480px] z-[60]"
        onInteractOutside={(e) => e.preventDefault()}
        /* easter egg — lets an egg lay itself out around the card instead of behind it */
        data-daily-brief-card=""
      >
        <EasterEggSlot active={open} /> {/* easter egg — safe to delete */}
        <DialogHeader className="space-y-1">
          <DialogTitle {...reveal(REVEAL_DELAY.title, 'text-primary text-xl')}>
            {t`Good morning, ${displayName}!`}
          </DialogTitle>
          <DialogDescription
            {...reveal(REVEAL_DELAY.date, 'text-sm text-muted-foreground')}
          >
            {format(new Date(), 'EEEE, d MMMM', { locale: dateLocale })}
          </DialogDescription>
        </DialogHeader>

        {/* Expanding a list can make this tall — scroll inside, so the header
            and the OK button stay put and dividers never get clipped. */}
        <div className="-mr-2 max-h-[60vh] space-y-4 overflow-y-auto pr-2">
          <DailyBriefStats
            overdueCount={overdueTasks.length}
            todayCount={todayTasks.length}
            loading={loading}
          />

          <section className="space-y-2">
            <SectionHeading
              title={t`Overdue`}
              count={loading ? undefined : plural(overdueTasks.length, {
                one: '# task',
                other: '# tasks',
              })}
              delay={REVEAL_DELAY.overdueHeading}
            />
            {loading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <DailyBriefTaskList
                tasks={overdueTasks}
                onTaskClick={handleTaskClick}
                emptyLabel={t`Nothing overdue. Great job!`}
                baseDelay={REVEAL_DELAY.overdueList}
                renderMeta={(task) => {
                  const days = getOverdueDays(task.endDate, todayKey);
                  return (
                    <span className="font-medium text-destructive">
                      {plural(days, { one: '# day', other: '# days' })}
                    </span>
                  );
                }}
              />
            )}
          </section>

          <Divider delay={REVEAL_DELAY.todayHeading - 40} />

          <section className="space-y-2">
            <SectionHeading
              title={t`Today`}
              count={loading ? undefined : plural(todayTasks.length, {
                one: '# task',
                other: '# tasks',
              })}
              delay={REVEAL_DELAY.todayHeading}
            />
            {loading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <DailyBriefTaskList
                tasks={todayTasks}
                onTaskClick={handleTaskClick}
                emptyLabel={t`Nothing due today.`}
                baseDelay={REVEAL_DELAY.todayList}
                renderMeta={(task) => {
                  const project = projects.find((p) => p.id === task.projectId);
                  return project
                    ? <span className="text-muted-foreground">{project.name}</span>
                    : null;
                }}
              />
            )}
          </section>

          <Divider delay={REVEAL_DELAY.milestonesHeading - 40} />

          <section className="space-y-2">
            <SectionHeading
              title={t`Deadlines this week`}
              delay={REVEAL_DELAY.milestonesHeading}
            />
            <DailyBriefMilestones
              milestones={upcomingMilestones}
              projects={projects}
              baseDelay={REVEAL_DELAY.milestonesList}
            />
          </section>
        </div>

        <DialogFooter>
          <Button onClick={onDismiss} {...reveal(REVEAL_DELAY.footer)}>{t`OK`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
