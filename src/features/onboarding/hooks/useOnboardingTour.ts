import { startTransition, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Driver } from 'driver.js';
import { useAuthStore } from '@/features/auth/store/authStore';
import {
  getOnboardingPagePath,
  isOnboardingPageId,
  ONBOARDING_PENDING_PAGE_STORAGE_KEY,
  type OnboardingPageId,
} from '@/features/onboarding/lib/onboardingFlow';
import { createOnboardingTour } from '@/features/onboarding/lib/onboardingTour';
import {
  fetchProfilePreferences,
  updateProfilePreferences,
} from '@/infrastructure/auth/onboardingPreferencesRepository';
import 'driver.js/dist/driver.css';

type UseOnboardingTourOptions = {
  pageId: OnboardingPageId;
  canEdit?: boolean;
  hasProjectAssigneeTarget?: boolean;
  isAdmin?: boolean;
  prepareMembersAccess?: () => void;
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
  prepareMembersAccess,
}: UseOnboardingTourOptions) => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const started = useRef(false);
  const activeTour = useRef<Driver | null>(null);
  const canEditRef = useRef(canEdit);
  const hasProjectAssigneeTargetRef = useRef(hasProjectAssigneeTarget);
  const isAdminRef = useRef(isAdmin);
  const prepareMembersAccessRef = useRef(prepareMembersAccess);

  canEditRef.current = canEdit;
  hasProjectAssigneeTargetRef.current = hasProjectAssigneeTarget;
  isAdminRef.current = isAdmin;
  prepareMembersAccessRef.current = prepareMembersAccess;

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
          prepareMembersAccess: prepareMembersAccessRef.current,
        });

        activeTour.current.drive();
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
