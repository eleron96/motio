import { addDays, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { fetchUrgentTasks } from '@/infrastructure/tasks/urgentTasksRepository';
import type { Milestone, Task } from '@/features/planner/types/planner';
import { splitDailyBriefTasks } from '../lib/dailyBriefBuckets';

type UseDailyBriefDataParams = {
  workspaceId: string;
  assigneeId: string;
  enabled: boolean;
};

type UseDailyBriefDataResult = {
  /** Due strictly before today. */
  overdueTasks: Task[];
  /** Due today. */
  todayTasks: Task[];
  upcomingMilestones: Milestone[];
  todayKey: string;
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

  // The fetch already narrows to end_date <= today, so both buckets come out of
  // the same rows — no extra request, no aggregate on the server.
  const { overdue, today: dueToday } = splitDailyBriefTasks(tasksQuery.data ?? [], today);

  return {
    overdueTasks: overdue,
    todayTasks: dueToday,
    upcomingMilestones,
    todayKey: today,
    loading: tasksQuery.isLoading,
  };
};
