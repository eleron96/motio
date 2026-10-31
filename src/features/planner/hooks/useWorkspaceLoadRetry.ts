import { useEffect } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';

/**
 * A failed workspace load used to stay on the error until a manual reload:
 * nothing retried it, and without a loaded window live sync doesn't start
 * either. While the load has failed, it is retried when the network comes back
 * or the tab becomes visible again.
 */
export function useWorkspaceLoadRetry(workspaceId: string | null): void {
  const loadError = usePlannerStore((state) => state.error);
  const loadWorkspaceData = usePlannerStore((state) => state.loadWorkspaceData);

  useEffect(() => {
    if (!loadError || !workspaceId || typeof window === 'undefined') return undefined;
    const retry = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (usePlannerStore.getState().loading) return;
      void loadWorkspaceData(workspaceId);
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [loadError, workspaceId, loadWorkspaceData]);
}
