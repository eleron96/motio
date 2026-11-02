import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';
import { t } from '@lingui/macro';
import type { GroupMode } from '@/features/planner/types/planner';
import {
  findVisibleTaskBar,
  removeTourSpotlight,
  spotlightAround,
  spotlightTimelineRow,
} from '@/features/onboarding/lib/tourTargets';

export type OnboardingTourArgs = {
  canEdit: boolean;
  isAdmin: boolean;
  /** Rows show people or projects: the tour describes the rows on screen. */
  groupMode: GroupMode;
  /** ⌘Z on Apple devices, Ctrl+Z elsewhere. */
  undoShortcut: string;
};

type CreateOnboardingTourArgs = OnboardingTourArgs & {
  /** Finished, skipped or closed — the tour is over either way. */
  onClose: () => void;
};

/**
 * A step whose element may be missing (the timeline scrolled, no task on
 * screen). driver.js handles that — the text shows in the middle of the
 * screen — but its type promises an element every time.
 */
const findOrCenter = (find: () => Element | undefined) => find as () => Element;

/**
 * The tour stays on the timeline and teaches what to do there — read the rows,
 * add a task, move it, find the deadlines — instead of walking the newcomer
 * through every section and leaving them on the Team page. It used to: four
 * pages, fourteen steps, and most of them only named a place ("this is the
 * dashboard"). Sections other than the timeline get one sentence each at the
 * end, pointing at the menu where they live.
 *
 * Viewers get the same tour without the steps about changing the plan.
 */
export const buildOnboardingSteps = ({
  canEdit,
  isAdmin,
  groupMode,
  undoShortcut,
}: OnboardingTourArgs): DriveStep[] => {
  const byProject = groupMode === 'project';
  const steps: DriveStep[] = [];

  steps.push({
    popover: {
      title: t`Your team's shared timeline`,
      description: byProject
        ? t`Each row is a project, each bar is one of its tasks. The red-striped column is today.`
        : t`Each row is a person, each bar is one of their tasks, and its colour is the project. The red-striped column is today.`,
      nextBtnText: t`Show me`,
      showButtons: ['next', 'close'],
    },
  });

  if (canEdit) {
    steps.push({
      element: findOrCenter(() => spotlightTimelineRow('[data-tour="timeline-first-row"]')),
      popover: {
        title: t`Double-click a day to add a task`,
        description: byProject
          ? t`Double-click any day in a project's row: the form opens with that project and date already filled in. The Add task button at the top does the same.`
          : t`Double-click any day in a person's row: the form opens with that person and date already filled in. The Add task button at the top does the same.`,
        side: 'bottom',
        align: 'start',
      },
    });
  }

  steps.push({
    element: findOrCenter(findVisibleTaskBar),
    popover: canEdit
      ? {
        title: t`Drag to reschedule`,
        description: t`Drag a bar to move its dates, drag its edge to make it longer or shorter. Moved it by mistake? ${undoShortcut}. Click a task to open it: assignees, subtasks, comments.`,
      }
      : {
        title: t`Click a task to open it`,
        description: t`You'll see its description, subtasks and comments. You have view access: editors and admins change the plan.`,
      },
  });

  steps.push({
    element: findOrCenter(() => spotlightTimelineRow('[data-tour="milestones-row"]')),
    popover: {
      title: t`Milestones: deadlines for everyone`,
      description: canEdit
        ? t`Double-click a day in this row to add a project milestone. Everyone sees it above their own tasks.`
        : t`Project deadlines live in this row, above everyone's tasks.`,
      side: 'bottom',
      align: 'start',
    },
  });

  steps.push({
    element: '[data-tour="group-mode-toggle"]',
    popover: {
      title: t`People or projects`,
      description: byProject
        ? t`Switch to People to see the same tasks with one row per person — a quick way to spot who is overloaded.`
        : t`Switch to Projects to see the same tasks with one row per project — a quick way to check that every project has someone on it.`,
      side: 'bottom',
      align: 'end',
    },
  });

  steps.push({
    // The admin's tip also sends them to the gear beside the menu: light both.
    element: isAdmin
      ? findOrCenter(() => spotlightAround(['[data-tour="settings-btn"]', '[data-tour="nav-bar"]']))
      : '[data-tour="nav-bar"]',
    popover: {
      title: t`The rest is up here`,
      description: isAdmin
        ? t`Dashboard shows workload charts, Projects holds clients and milestones, Team lists people and groups. To invite colleagues, open the gear next to the workspace name.`
        : t`Dashboard shows workload charts, Projects holds clients and milestones, Team lists people and groups.`,
      side: 'bottom',
      align: 'start',
      doneBtnText: t`Got it`,
    },
  });

  return steps;
};

const createSkipButton = (popover: PopoverDOM, handleDismiss: () => void) => {
  let skipButton = popover.footer.querySelector<HTMLButtonElement>('.motio-tour-skip-btn');

  if (!skipButton) {
    skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'motio-tour-skip-btn';
    popover.footer.insertBefore(skipButton, popover.progress);
  }

  skipButton.textContent = String(t`Skip`);
  skipButton.setAttribute('aria-label', String(t`Skip`));
  skipButton.onclick = () => handleDismiss();
};

export const createOnboardingTour = ({ onClose, ...args }: CreateOnboardingTourArgs): Driver => {
  const tourDriver = driver({
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    animate: true,
    allowClose: true,
    // Клик по затемнению не делает ничего. Раньше он засчитывал весь тур
    // пройденным навсегда; «листать вперёд» тоже не годится — несколько
    // случайных промахов пролистывают тур целиком. Тур двигается и
    // закрывается только кнопками.
    overlayClickBehavior: () => {},
    // Подсказки рассказывают, что делать, а не просят делать это сейчас:
    // двойной клик по подсвеченной строке открыл бы форму задачи под
    // затемнением тура, где её не закрыть.
    disableActiveInteraction: true,
    overlayColor: 'rgba(0, 0, 0, 0.7)',
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: 'motio-tour-popover',
    progressText: '{{current}} / {{total}}',
    nextBtnText: t`Next`,
    prevBtnText: t`Back`,
    steps: buildOnboardingSteps(args),
    onPopoverRender: (popover) => {
      createSkipButton(popover, () => tourDriver.destroy());
      // Ensure the popover is always wide enough to fit all footer buttons.
      // driver.js sets width via inline styles which override CSS rules.
      popover.wrapper.style.minWidth = 'fit-content';
      popover.wrapper.style.width = 'fit-content';
    },
    onDestroyed: () => {
      removeTourSpotlight();
      onClose();
    },
  });

  return tourDriver;
};
