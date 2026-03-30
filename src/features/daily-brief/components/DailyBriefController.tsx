import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useDailyBriefTrigger } from '../hooks/useDailyBriefTrigger';
import { DailyBriefModal } from './DailyBriefModal';

export const DailyBriefController = () => {
  const user = useAuthStore((s) => s.user);
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const assignees = usePlannerStore((s) => s.assignees);

  const assignee = user ? assignees.find((a) => a.userId === user.id) : null;

  const { isOpen, dismiss } = useDailyBriefTrigger(user?.id ?? null);

  if (!user || !currentWorkspaceId || !assignee || !isOpen) return null;

  return (
    <DailyBriefModal
      open={isOpen}
      onDismiss={dismiss}
      workspaceId={currentWorkspaceId}
      assigneeId={assignee.id}
    />
  );
};
