import { useEffect, useState } from 'react';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { fetchTaskAttribution, type TaskAttribution } from '@/infrastructure/tasks/taskAttributionRepository';

const UNKNOWN_ATTRIBUTION: TaskAttribution = { createdByName: null, updatedByName: null };

interface AttributionSnapshot {
  taskId: string;
  updatedAt: string | undefined;
  attribution: TaskAttribution;
}

/** Names follow the confirmed task version; loading never blocks editing. */
export const useTaskAttribution = (taskId: string | null, updatedAt?: string): TaskAttribution => {
  const isDemo = useIsDemo();
  const [snapshot, setSnapshot] = useState<AttributionSnapshot | null>(null);

  useEffect(() => {
    if (!taskId || isDemo) return;
    let active = true;
    void fetchTaskAttribution(taskId, updatedAt)
      .catch(() => UNKNOWN_ATTRIBUTION)
      .then((attribution) => {
        if (active) setSnapshot({ taskId, updatedAt, attribution });
      });
    return () => { active = false; };
  }, [taskId, updatedAt, isDemo]);

  // Never pair a new task/date with names from an older request. Missing
  // metadata leaves the existing dates visible without interrupting work.
  if (isDemo || !taskId || snapshot?.taskId !== taskId || snapshot.updatedAt !== updatedAt) {
    return UNKNOWN_ATTRIBUTION;
  }
  return snapshot.attribution;
};
