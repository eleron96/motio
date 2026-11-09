import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useWorkspaceClosuresStore } from '@/features/planner/store/workspaceClosuresStore';
import { useInstanceSetting } from '@/shared/store/instanceSettingsStore';
import type { WorkspaceClosure } from '@/shared/domain/workspaceClosures';

const NONE: WorkspaceClosure[] = [];

/**
 * The current workspace's days off for everyone — only where the server allows
 * them (Admin → Settings → Days off for the whole workspace). Off: always the
 * same empty list and no request, so the holiday map is exactly as before.
 */
export const useWorkspaceClosures = (): WorkspaceClosure[] => {
  const enabled = useInstanceSetting('workspaces.closures');
  const workspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const closures = useWorkspaceClosuresStore((state) => (
    enabled && workspaceId ? state.byWorkspace[workspaceId] : undefined
  ));
  const load = useWorkspaceClosuresStore((state) => state.load);

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    void load(workspaceId);
  }, [enabled, workspaceId, load]);

  return enabled && closures ? closures : NONE;
};
