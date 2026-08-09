import { startTransition, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import {
  getOnboardingPagePath,
  isOnboardingPageId,
  ONBOARDING_PENDING_PAGE_STORAGE_KEY,
  type OnboardingPageId,
} from '@/features/onboarding/lib/onboardingFlow';
import {
  fetchProfilePreferences,
  updateProfilePreferences,
} from '@/infrastructure/auth/onboardingPreferencesRepository';

// driver.js (the tour engine) plus its CSS weigh ~290 KB raw. Most users
// have already completed the tour, so we postpone fetching that bundle
// until we know the current user genuinely needs it.
type Driver = Awaited<ReturnType<typeof loadTourModule>>['createOnboardingTour'] extends
  (...args: never[]) => infer R ? R : never;

const loadTourModule = async () => {
  const [tourMod] = await Promise.all([
    import('@/features/onboarding/lib/onboardingTour'),
    import('driver.js/dist/driver.css'),
  ]);
  return tourMod;
};

type UseOnboardingTourOptions = {
  pageId: OnboardingPageId;
  canEdit?: boolean;
  hasProjectAssigneeTarget?: boolean;
  isAdmin?: boolean;
};

const readPendingPage = (): OnboardingPageId | null => {
  if (typeof window === 'undefined') return null;
  const rawValue = window.sessionStorage.getItem(ONBOARDING_PENDING_PAGE_STORAGE_KEY);
  return isOnboardingPageId(rawValue) ? rawValue : null;
};

const writePendingPage = (pageId: OnboardingPageId) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ONBOARDING_PENDING_PAGE_STORAGE_KEY, pageId);
};

const clearPendingPage = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ONBOARDING_PENDING_PAGE_STORAGE_KEY);
};

export const useOnboardingTour = ({
  pageId,
  canEdit = false,
  hasProjectAssigneeTarget = false,
  isAdmin = false,
}: UseOnboardingTourOptions) => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const started = useRef(false);
  const activeTour = useRef<Driver | null>(null);
  const canEditRef = useRef(canEdit);
  const hasProjectAssigneeTargetRef = useRef(hasProjectAssigneeTarget);
  const isAdminRef = useRef(isAdmin);

  canEditRef.current = canEdit;
  hasProjectAssigneeTargetRef.current = hasProjectAssigneeTarget;
  isAdminRef.current = isAdmin;

  useEffect(() => {
    if (!user || started.current) return;

    let cancelled = false;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;

    const checkAndStart = async () => {
      const prefs = await fetchProfilePreferences(user.id);
      if (cancelled || !prefs) return;
      if (prefs.onboarding_completed === true) return;

      const pendingPage = readPendingPage();
      if (pendingPage && pendingPage !== pageId) return;

      const markCompleted = async () => {
        clearPendingPage();
        await updateProfilePreferences(user.id, {
          ...prefs,
          onboarding_completed: true,
        });
      };

      startTimeout = setTimeout(() => {
        if (cancelled) return;
        started.current = true;

        void loadTourModule().then(({ createOnboardingTour }) => {
          if (cancelled) return;

          activeTour.current = createOnboardingTour({
            pageId,
            canEdit: canEditRef.current,
            hasProjectAssigneeTarget: hasProjectAssigneeTargetRef.current,
            isAdmin: isAdminRef.current,
            onAdvance: (nextPage) => {
              writePendingPage(nextPage);
              startTransition(() => {
                navigate(getOnboardingPagePath(nextPage));
              });
            },
            onDismiss: () => {
              void markCompleted();
            },
            onComplete: () => {
              void markCompleted();
            },
          });

          activeTour.current.drive();
        });
      }, 800);
    };

    void checkAndStart();

    return () => {
      cancelled = true;
      if (startTimeout) {
        clearTimeout(startTimeout);
      }
      const currentTour = activeTour.current;
      activeTour.current = null;
      if (currentTour?.isActive()) {
        currentTour.destroy();
      }
    };
  }, [navigate, pageId, user]);
};
