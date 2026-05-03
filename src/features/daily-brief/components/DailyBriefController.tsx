import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';
import { useDailyBriefTrigger } from '../hooks/useDailyBriefTrigger';
import { DailyBriefModal } from './DailyBriefModal';

export const DailyBriefController = () => {
  const user = useAuthStore((s) => s.user);
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const assignees = usePlannerStore((s) => s.assignees);

  const assignee = user ? assignees.find((a) => a.userId === user.id) : null;

  const { isOpen, dismiss } = useDailyBriefTrigger(user?.id ?? null);

  // DailyBriefController is mounted in App.tsx outside <BrowserRouter>,
  // so we cannot use the useIsDemo() hook here (it'd throw because
  // useLocation has no router context). isDemoRoute() reads
  // window.location directly, which is fine because this controller is
  // gated by user presence — by the time the brief modal could open the
  // route has been on /app or /demo for a while.
  if (isDemoRoute() || !user || !currentWorkspaceId || !assignee || !isOpen) return null;

  return (
    <DailyBriefModal
      open={isOpen}
      onDismiss={dismiss}
      workspaceId={currentWorkspaceId}
      assigneeId={assignee.id}
    />
  );
};
