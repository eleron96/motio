import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { useDailyBriefTrigger } from '../hooks/useDailyBriefTrigger';
import { DailyBriefModal } from './DailyBriefModal';

export const DailyBriefController = () => {
  const user = useAuthStore((s) => s.user);
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const assignees = usePlannerStore((s) => s.assignees);
  const isDemo = useIsDemo();

  const assignee = user ? assignees.find((a) => a.userId === user.id) : null;

  const { isOpen, dismiss } = useDailyBriefTrigger(user?.id ?? null);

  if (isDemo || !user || !currentWorkspaceId || !assignee || !isOpen) return null;

  return (
    <DailyBriefModal
      open={isOpen}
      onDismiss={dismiss}
      workspaceId={currentWorkspaceId}
      assigneeId={assignee.id}
    />
  );
};
