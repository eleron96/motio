import { startTransition, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useSampleChoiceStore } from '@/features/onboarding/store/sampleChoiceStore';
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
  isAdmin?: boolean;
};

/** Даём странице отрисоваться, прежде чем подсвечивать её элементы. */
const START_DELAY_MS = 800;
/** Как часто проверяем, освободился ли экран от чужой модалки. */
const MODAL_POLL_MS = 400;
/** Дольше этого не ждём: молчаливый тур хуже, чем тур поверх забытой модалки. */
const MODAL_WAIT_LIMIT_MS = 30000;

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
  isAdmin = false,
}: UseOnboardingTourOptions) => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  // Половина якорей тура живёт только в десктопной вёрстке: на телефоне
  // навигация, настройки и вкладки «Команды» — другие компоненты. driver.js в
  // таком случае не падает и не пропускает шаг, а вешает подсказку по центру
  // пустого затемнённого экрана. Молчать честнее; флаг «пройден» не ставим,
  // поэтому тур дождётся человека за компьютером.
  const isMobile = useIsMobile();
  const started = useRef(false);
  const activeTour = useRef<Driver | null>(null);
  const canEditRef = useRef(canEdit);
  const isAdminRef = useRef(isAdmin);

  canEditRef.current = canEdit;
  isAdminRef.current = isAdmin;

  useEffect(() => {
    if (!user || started.current || isMobile) return;

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

      // Утренний бриф встречает новичка ровно в тот же момент. Запуск тура
      // под ним оставлял человека наедине с двумя наложенными затемнениями:
      // подсказок не видно, а клики уходят в оверлей тура. Ждём, пока экран
      // освободится, но не бесконечно — если модалку не закрывают, начинаем.
      let waitedForModal = 0;
      const startWhenScreenIsFree = () => {
        if (cancelled) return;

        const modalOpen = typeof document !== 'undefined' && Boolean(document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        ));
        if (modalOpen && waitedForModal < MODAL_WAIT_LIMIT_MS) {
          waitedForModal += MODAL_POLL_MS;
          startTimeout = setTimeout(startWhenScreenIsFree, MODAL_POLL_MS);
          return;
        }

        started.current = true;

        void loadTourModule().then(({ createOnboardingTour }) => {
          if (cancelled) return;

          activeTour.current = createOnboardingTour({
            pageId,
            canEdit: canEditRef.current,
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
              // Тур прошёл по таймлайну, собранному из примеров — теперь
              // человек решает, оставить их или начать с чистого листа.
              if (usePlannerStore.getState().hasSampleData) {
                useSampleChoiceStore.getState().askSampleChoice();
              }
            },
          });

          activeTour.current.drive();
        });
      };

      startTimeout = setTimeout(startWhenScreenIsFree, START_DELAY_MS);
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
  }, [navigate, pageId, user, isMobile]);
};
