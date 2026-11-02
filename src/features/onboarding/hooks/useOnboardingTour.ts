import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { isApplePlatform } from '@/features/planner/lib/searchShortcut';
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
  canEdit?: boolean;
  isAdmin?: boolean;
};

/**
 * The phone intro is a sheet the page renders: hidden until it is due, then
 * open, then closed — kept mounted after closing so it can slide away.
 */
export type MobileIntroState = 'hidden' | 'open' | 'closed';

/** Даём странице отрисоваться, прежде чем подсвечивать её элементы. */
const START_DELAY_MS = 800;
/** Как часто проверяем, освободился ли экран от чужой модалки. */
const MODAL_POLL_MS = 400;
/** Дольше этого не ждём: молчаливый тур хуже, чем тур поверх забытой модалки. */
const MODAL_WAIT_LIMIT_MS = 30000;
/**
 * Сколько ждём, пока пространство создастся и данные приедут. У новичка первое
 * пространство заводится уже после входа (ensure_initial_workspace), и без
 * этого ожидания тур успевал стартовать по пустой сетке.
 */
const WORKSPACE_WAIT_LIMIT_MS = 15000;
/** Сколько ждём, пока таймлайн, на который переключил тур, отрисуется. */
const VIEW_SWITCH_SETTLE_MS = 350;

/**
 * Готово ли то, что тур собирается показывать: пространство и его данные на
 * таймлайне. Не дождались за отведённое время — тур в этот заход молчит; флаг
 * «пройден» не ставится, так что он придёт в следующий.
 */
const isWorkspaceReady = (): boolean => {
  const { workspacesLoaded, currentWorkspaceId } = useAuthStore.getState();
  if (!workspacesLoaded || !currentWorkspaceId) return false;
  return usePlannerStore.getState().loadedRange?.workspaceId === currentWorkspaceId;
};

/**
 * Тур показывает строки, полоски и вехи таймлайна. Человек, который вернулся
 * к туру из настроек, мог оставить планировщик на календаре или доске — там
 * этих элементов нет, и подсказки повисли бы в пустоте. Возвращаем таймлайн;
 * true — если пришлось переключить и надо дать ему отрисоваться.
 */
const showTimeline = (): boolean => {
  const { plannerSurface, viewMode, setPlannerSurface, setViewMode } = usePlannerStore.getState();
  let switched = false;
  if (plannerSurface === 'board') {
    setPlannerSurface('timeline');
    switched = true;
  }
  if (viewMode === 'calendar') {
    setViewMode('day');
    switched = true;
  }
  return switched;
};

const undoShortcutLabel = () => (
  typeof navigator !== 'undefined' && isApplePlatform(navigator.platform) ? '⌘Z' : 'Ctrl+Z'
);

/**
 * First meeting with the timeline: a guided tour on a computer, a few cards on
 * a phone. Whichever the person sees first counts — `onboarding_completed` is
 * one flag, and "Show again" in account settings brings back the version for
 * the device they open next.
 */
export const useOnboardingTour = ({
  canEdit = false,
  isAdmin = false,
}: UseOnboardingTourOptions) => {
  // По id, а не по объекту: объект пользователя приходит заново при
  // обновлении сессии, и эффект прибивал бы идущий тур.
  const userId = useAuthStore((state) => state.user?.id ?? null);
  // Тур на компьютере держится за элементы десктопной вёрстки; на телефоне их
  // нет, поэтому там вместо него карточки. Решение принимаем один раз за жизнь
  // страницы: useIsMobile следит за шириной, и поворот телефона в ландшафт
  // (~844 px) перещёлкивал его в «десктоп» — тур уходил гулять по мобильной
  // вёрстке, где его якорей нет.
  const isMobileNow = useIsMobile();
  const isMobileAtMount = useRef(isMobileNow);
  const isMobile = isMobileAtMount.current;
  const started = useRef(false);
  const activeTour = useRef<Driver | null>(null);
  const canEditRef = useRef(canEdit);
  const isAdminRef = useRef(isAdmin);
  const markCompletedRef = useRef<(() => Promise<void>) | null>(null);
  const [mobileIntro, setMobileIntro] = useState<MobileIntroState>('hidden');

  canEditRef.current = canEdit;
  isAdminRef.current = isAdmin;

  useEffect(() => {
    if (!userId || started.current) return;

    let cancelled = false;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;

    const checkAndStart = async () => {
      const prefs = await fetchProfilePreferences(userId);
      if (cancelled || !prefs) return;
      if (prefs.onboarding_completed === true) return;

      markCompletedRef.current = async () => {
        // Перечитываем: пока шёл тур, человек мог поменять другие настройки
        // профиля, и запись снимка с начала тура их бы откатила.
        const latest = await fetchProfilePreferences(userId);
        await updateProfilePreferences(userId, {
          ...(latest ?? prefs),
          onboarding_completed: true,
        });
      };

      const startDesktopTour = () => {
        void loadTourModule().then(({ createOnboardingTour }) => {
          if (cancelled) return;

          const drive = () => {
            if (cancelled) return;
            activeTour.current = createOnboardingTour({
              canEdit: canEditRef.current,
              isAdmin: isAdminRef.current,
              groupMode: usePlannerStore.getState().groupMode,
              undoShortcut: undoShortcutLabel(),
              // Про примеры окном не спрашиваем: над экраном и так висит полоса
              // «часть данных — примеры» с кнопкой «Убрать примеры»
              // (SampleDataBanner) — и там, где тура нет вовсе.
              onClose: () => {
                // Страница ушла посреди тура — это не «пройден»: тур
                // вернётся в следующий заход.
                if (cancelled) return;
                void markCompletedRef.current?.();
              },
            });
            activeTour.current.drive();
          };

          if (showTimeline()) {
            startTimeout = setTimeout(drive, VIEW_SWITCH_SETTLE_MS);
          } else {
            drive();
          }
        });
      };

      // Утренний бриф встречает новичка ровно в тот же момент. Запуск тура
      // под ним оставлял человека наедине с двумя наложенными затемнениями.
      // Ждём, пока экран освободится, но не бесконечно — если модалку не
      // закрывают, начинаем.
      let waitedForModal = 0;
      let waitedForWorkspace = 0;
      const startWhenScreenIsFree = () => {
        if (cancelled) return;

        // Сначала данные, потом подсказки о них.
        if (!isWorkspaceReady()) {
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
        if (isMobile) {
          setMobileIntro('open');
        } else {
          startDesktopTour();
        }
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
  }, [userId, isMobile]);

  const closeMobileIntro = useCallback(() => {
    setMobileIntro('closed');
    void markCompletedRef.current?.();
  }, []);

  return { mobileIntro, closeMobileIntro };
};
