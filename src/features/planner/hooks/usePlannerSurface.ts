import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isBoardViewAvailable } from '@/features/planner/lib/boardViewPreference';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import type { PlannerSurface } from '@/features/planner/types/planner';

/**
 * What the planner actually shows. The persisted choice is 'board' only when
 * the person picked it; it is honoured while the board is available to them
 * (build flag + their preference) and on desktop — the phone layer has no
 * board yet, so a phone keeps showing the timeline without overwriting the
 * stored choice.
 */
export const usePlannerSurface = (): { surface: PlannerSurface; boardAvailable: boolean } => {
  const storedSurface = usePlannerStore((state) => state.plannerSurface);
  const preferenceOn = useAuthStore((state) => isBoardViewAvailable(state.profilePreferences));
  const isMobile = useIsMobile();
  const boardAvailable = preferenceOn && !isMobile;
  return {
    surface: boardAvailable && storedSurface === 'board' ? 'board' : 'timeline',
    boardAvailable,
  };
};
