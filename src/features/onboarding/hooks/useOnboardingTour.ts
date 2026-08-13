import { startTransition, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
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
/**
 * Сколько ждём, пока пространство создастся и данные приедут. У новичка первое
 * пространство заводится уже после входа (ensure_initial_workspace), и без
 * этого ожидания тур успевал стартовать по пустой сетке: якорь таймлайна есть
 * всегда, поэтому подсказки честно висели над «задач пока нет».
 */
const WORKSPACE_WAIT_LIMIT_MS = 15000;

/**
 * Готово ли то, что тур собирается показывать. На таймлайне ждём и сами
 * данные — остальным страницам довольно созданного пространства. Не дождались
 * за отведённое время — тур в этот заход молчит; флаг «пройден» не ставится,
 * так что он придёт в следующий.
 */
const isWorkspaceReady = (pageId: OnboardingPageId): boolean => {
  const { workspacesLoaded, currentWorkspaceId } = useAuthStore.getState();
  if (!workspacesLoaded || !currentWorkspaceId) return false;
  if (pageId !== 'planner') return true;
  return usePlannerStore.getState().loadedRange?.workspaceId === currentWorkspaceId;
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
  isAdmin = false,
}: UseOnboardingTourOptions) => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  // Половина якорей тура живёт только в десктопной вёрстке: на телефоне
  // навигация, настройки и вкладки «Команды» — другие компоненты. driver.js в
  // таком случае не падает и не пропускает шаг, а вешает подсказку по центру
  // пустого затемнённого экрана. Молчать честнее; флаг «пройден» не ставим,
  // поэтому тур дождётся человека за компьютером.
  // Решение принимаем один раз за жизнь страницы. useIsMobile следит за
  // шириной, и поворот телефона в ландшафт (~844 px) перещёлкивал его в
  // «десктоп»: эффект перезапускался и тур уходил гулять по мобильной
  // вёрстке, где половины якорей нет — затемнение и подсказка по центру пустоты.
  const isMobileNow = useIsMobile();
  const isMobileAtMount = useRef(isMobileNow);
  const isMobile = isMobileAtMount.current;
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
      let waitedForWorkspace = 0;
      const startWhenScreenIsFree = () => {
        if (cancelled) return;

        // Сначала данные, потом подсказки о них.
        if (!isWorkspaceReady(pageId)) {
          if (waitedForWorkspace >= WORKSPACE_WAIT_LIMIT_MS) return;
          waitedForWorkspace += MODAL_POLL_MS;
          startTimeout = setTimeout(startWhenScreenIsFree, MODAL_POLL_MS);
          return;
        }

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
            // Про примеры больше не спрашиваем окном: над экраном и так висит
            // полоса «часть данных — примеры» с кнопкой «Убрать примеры»
            // (SampleDataBanner). Третье окно подряд в первую минуту — шум, а
            // не забота; полоса живёт до тех пор, пока примеры не убраны, и
            // работает там, где тур не идёт вовсе: на телефоне и у приглашённых.
            onDismiss: () => {
              void markCompleted();
            },
            onComplete: () => {
              void markCompleted();
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
