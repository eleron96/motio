import { t } from '@lingui/macro';
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
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDailyBriefData } from '../hooks/useDailyBriefData';
import { DailyBriefUrgentTasks } from './DailyBriefUrgentTasks';
import { DailyBriefMilestones } from './DailyBriefMilestones';

type Props = {
  open: boolean;
  onDismiss: () => void;
  workspaceId: string;
  assigneeId: string;
};

const getTodayLabel = (): string => {
  return format(new Date(), 'EEEE, d MMMM');
};

export const DailyBriefModal = ({ open, onDismiss, workspaceId, assigneeId }: Props) => {
  const profileDisplayName = useAuthStore((s) => s.profileDisplayName);
  const projects = usePlannerStore((s) => s.projects);

  const { urgentTasks, upcomingMilestones, loading } = useDailyBriefData({
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
      <DialogContent className="sm:max-w-[480px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-primary text-xl">
            {t`Good morning, ${displayName}!`}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {getTodayLabel()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <span>⚠️</span>
              {t`Urgent tasks`}
            </h3>
            {loading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <DailyBriefUrgentTasks
                tasks={urgentTasks}
                onTaskClick={handleTaskClick}
              />
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <span>🏁</span>
              {t`Milestones in the next 7 days`}
            </h3>
            <DailyBriefMilestones
              milestones={upcomingMilestones}
              projects={projects}
            />
          </section>
        </div>

        <DialogFooter>
          <Button onClick={onDismiss}>{t`OK`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
