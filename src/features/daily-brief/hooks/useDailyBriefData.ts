import { addDays, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { fetchUrgentTasks } from '@/infrastructure/tasks/urgentTasksRepository';
import type { Milestone, Task } from '@/features/planner/types/planner';

type UseDailyBriefDataParams = {
  workspaceId: string;
  assigneeId: string;
  enabled: boolean;
};

type UseDailyBriefDataResult = {
  urgentTasks: Task[];
  upcomingMilestones: Milestone[];
  loading: boolean;
};

export const useDailyBriefData = ({
  workspaceId,
  assigneeId,
  enabled,
}: UseDailyBriefDataParams): UseDailyBriefDataResult => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const in7Days = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  const statuses = usePlannerStore((s) => s.statuses);
  const allMilestones = usePlannerStore((s) => s.milestones);

  const nonFinalStatusIds = statuses
    .filter((s) => !s.isFinal && !s.isCancelled)
    .map((s) => s.id);

  const tasksQuery = useQuery({
    queryKey: ['daily-brief-tasks', workspaceId, assigneeId, today],
    enabled: enabled && nonFinalStatusIds.length > 0,
    queryFn: () =>
      fetchUrgentTasks({ workspaceId, assigneeId, nonFinalStatusIds }),
  });

  const upcomingMilestones = allMilestones.filter(
    (m) => m.date >= today && m.date <= in7Days,
  );

  return {
    urgentTasks: tasksQuery.data ?? [],
    upcomingMilestones,
    loading: tasksQuery.isLoading,
  };
};
