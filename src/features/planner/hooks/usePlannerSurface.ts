import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isBoardViewAvailable } from '@/features/planner/lib/boardViewPreference';
import type { PlannerSurface } from '@/features/planner/types/planner';

/**
 * What the planner actually shows. The persisted choice is 'board' only when
 * the person picked it; it is honoured while the board is available to them
 * (build flag + their preference), on desktop and on a phone alike.
 */
export const usePlannerSurface = (): { surface: PlannerSurface; boardAvailable: boolean } => {
  const storedSurface = usePlannerStore((state) => state.plannerSurface);
  const boardAvailable = useAuthStore((state) => isBoardViewAvailable(state.profilePreferences));
  return {
    surface: boardAvailable && storedSurface === 'board' ? 'board' : 'timeline',
    boardAvailable,
  };
};
