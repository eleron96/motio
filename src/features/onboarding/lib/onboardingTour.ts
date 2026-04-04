import { driver, type DriveStep, type Driver, type DriverHook, type PopoverDOM } from 'driver.js';
import { t } from '@lingui/macro';
import { getNextOnboardingPage, type OnboardingPageId } from '@/features/onboarding/lib/onboardingFlow';

type CreateOnboardingTourArgs = {
  pageId: OnboardingPageId;
  canEdit?: boolean;
  hasProjectAssigneeTarget?: boolean;
  isAdmin?: boolean;
  onAdvance: (nextPage: OnboardingPageId) => void;
  onDismiss: () => void;
  onComplete: () => void;
  prepareMembersAccess?: () => void;
};

type TourDestroyAction =
  | { type: 'dismiss' }
  | { type: 'advance'; nextPage: OnboardingPageId }
  | { type: 'complete' }
  | null;

const buildPlannerSteps = (advanceToNextPage: (nextPage: OnboardingPageId) => void): DriveStep[] => [
  {
    popover: {
      title: t`Welcome to Motio!`,
      description: t`Let's quickly walk through the key places in your workspace. You can skip this tour at any time.`,
      nextBtnText: t`Start`,
      showButtons: ['next', 'close'],
    },
  },
  {
    element: '[data-tour="timeline-grid"]',
    popover: {
      title: t`Your timeline`,
      description: t`Here you can see all tasks on a timeline. Drag, resize and plan work across the team.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: '[data-tour="add-task-btn"]',
    popover: {
      title: t`Create a task`,
      description: t`Click this button or double-click a date on the timeline to open the task form.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: '[data-tour="filter-toggle"]',
    popover: {
      title: t`Filters`,
      description: t`Filter tasks by project, people, groups, statuses and tags.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: '[data-tour="nav-dashboard"]',
    popover: {
      title: t`Dashboard`,
      description: t`Next, we'll open the dashboard and show where widgets are added and arranged.`,
      prevBtnText: t`Back`,
      doneBtnText: t`Open dashboard`,
      onNextClick: () => advanceToNextPage('dashboard'),
    },
  },
];

const buildDashboardSteps = (
  canEdit: boolean,
  advanceToNextPage: (nextPage: OnboardingPageId) => void,
): DriveStep[] => [
  {
    element: '[data-tour="dashboard-add-widget"]',
    popover: {
      title: canEdit ? t`Add a widget` : t`Widgets`,
      description: canEdit
        ? t`Use this button to add KPI, chart and milestone widgets to the dashboard.`
        : t`Editors and admins add widgets here to build the dashboard.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: '[data-tour="dashboard-canvas"]',
    popover: {
      title: t`Dashboard canvas`,
      description: t`Your widgets live here. Resize and rearrange them to monitor workload, deadlines and progress.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: '[data-tour="nav-projects"]',
    popover: {
      title: t`Projects`,
      description: t`Next, we'll open Projects to show where project details, tasks and assignees are visible.`,
      prevBtnText: t`Back`,
      doneBtnText: t`Open projects`,
      onNextClick: () => advanceToNextPage('projects'),
    },
  },
];

const buildProjectsSteps = (
  canEdit: boolean,
  hasProjectAssigneeTarget: boolean,
  advanceToNextPage: (nextPage: OnboardingPageId) => void,
): DriveStep[] => [
  {
    element: '[data-tour="projects-primary-action"]',
    popover: {
      title: canEdit ? t`New project` : t`Projects`,
      description: canEdit
        ? t`Create a new project here, then group tasks and milestones inside it.`
        : t`This is where your workspace projects are listed and reviewed.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: hasProjectAssigneeTarget ? '[data-tour="projects-assignee-filter"]' : '[data-tour="projects-main-panel"]',
    popover: {
      title: t`People on a project`,
      description: hasProjectAssigneeTarget
        ? t`This control shows assignees already involved in the selected project. Invite teammates on Team access, then assign them inside project tasks.`
        : t`Open a project here to see its tasks and assignees. People appear on a project once they are assigned to its tasks.`,
      nextBtnText: t`Next`,
      prevBtnText: t`Back`,
    },
  },
  {
    element: '[data-tour="nav-team"]',
    popover: {
      title: t`Team access`,
      description: t`We'll open Team next so you can see where invitations, roles and workspace access are managed.`,
      prevBtnText: t`Back`,
      doneBtnText: t`Open team`,
      onNextClick: () => advanceToNextPage('members'),
    },
  },
];

const buildMembersSteps = (
  isAdmin: boolean,
  prepareMembersAccess: (() => void) | undefined,
  completeTour: () => void,
): DriveStep[] => {
  if (!isAdmin) {
    return [
      {
        element: '[data-tour="members-people-tab"]',
        popover: {
          title: t`People and groups`,
          description: t`Use Team to browse people, groups and task ownership inside the workspace.`,
          nextBtnText: t`Next`,
          prevBtnText: t`Back`,
        },
      },
      {
        popover: {
          title: t`All set!`,
          description: t`You now know where to find timelines, dashboards, projects and team members in Motio.`,
          prevBtnText: t`Back`,
          doneBtnText: t`Finish`,
          onNextClick: () => completeTour(),
        },
      },
    ];
  }

  const openAccessModeAndContinue: DriverHook = (_element, _step, { driver: driverInstance }) => {
    prepareMembersAccess?.();
    window.setTimeout(() => {
      driverInstance.moveNext();
    }, 250);
  };

  return [
    {
      element: '[data-tour="members-access-tab"]',
      popover: {
        title: t`Team access`,
        description: t`This section contains invitations, roles and workspace access for your team.`,
        nextBtnText: t`Next`,
        prevBtnText: t`Back`,
        onNextClick: openAccessModeAndContinue,
      },
    },
    {
      element: '[data-tour="members-add-member"]',
      popover: {
        title: t`Invite teammates`,
        description: t`Use this button to add people to the workspace. After they join, you can assign them to project tasks.`,
        nextBtnText: t`Next`,
        prevBtnText: t`Back`,
      },
    },
    {
      popover: {
        title: t`All set!`,
        description: t`You now know where to create work, track progress and add people across Motio.`,
        prevBtnText: t`Back`,
        doneBtnText: t`Finish`,
        onNextClick: () => completeTour(),
      },
    },
  ];
};

const createSkipButton = (popover: PopoverDOM, handleDismiss: () => void) => {
  let skipButton = popover.footerButtons.querySelector<HTMLButtonElement>('.motio-tour-skip-btn');

  if (!skipButton) {
    skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'motio-tour-skip-btn';
    popover.footerButtons.prepend(skipButton);
  }

  skipButton.textContent = String(t`Skip`);
  skipButton.onclick = () => handleDismiss();
};

const buildSteps = ({
  canEdit,
  hasProjectAssigneeTarget,
  isAdmin,
  onAdvance,
  onComplete,
  pageId,
  prepareMembersAccess,
}: Omit<CreateOnboardingTourArgs, 'onDismiss'>) => {
  switch (pageId) {
    case 'planner':
      return buildPlannerSteps(onAdvance);
    case 'dashboard':
      return buildDashboardSteps(Boolean(canEdit), onAdvance);
    case 'projects':
      return buildProjectsSteps(Boolean(canEdit), Boolean(hasProjectAssigneeTarget), onAdvance);
    case 'members':
      return buildMembersSteps(Boolean(isAdmin), prepareMembersAccess, onComplete);
    default:
      return [];
  }
};

export const createOnboardingTour = ({
  pageId,
  canEdit = false,
  hasProjectAssigneeTarget = false,
  isAdmin = false,
  onAdvance,
  onDismiss,
  onComplete,
  prepareMembersAccess,
}: CreateOnboardingTourArgs): Driver => {
  let destroyAction: TourDestroyAction = null;

  const dismissTour = () => {
    destroyAction = { type: 'dismiss' };
    tourDriver.destroy();
  };

  const advanceToNextPage = (nextPage: OnboardingPageId) => {
    destroyAction = { type: 'advance', nextPage };
    tourDriver.destroy();
  };

  const completeTour = () => {
    destroyAction = { type: 'complete' };
    tourDriver.destroy();
  };

  const lastPage = getNextOnboardingPage(pageId) === null;
  const steps = buildSteps({
    pageId,
    canEdit,
    hasProjectAssigneeTarget,
    isAdmin,
    onAdvance: advanceToNextPage,
    onComplete: completeTour,
    prepareMembersAccess,
  });

  const tourDriver = driver({
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    animate: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    overlayColor: 'rgba(0, 0, 0, 0.7)',
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: 'motio-tour-popover',
    progressText: '{{current}} / {{total}}',
    doneBtnText: lastPage ? t`Finish` : t`Continue`,
    nextBtnText: t`Next`,
    prevBtnText: t`Back`,
    steps,
    onPopoverRender: (popover) => {
      createSkipButton(popover, dismissTour);
    },
    onDestroyed: () => {
      const action = destroyAction;
      destroyAction = null;

      if (action?.type === 'advance') {
        onAdvance(action.nextPage);
        return;
      }

      if (action?.type === 'complete') {
        onComplete();
        return;
      }

      onDismiss();
    },
  });

  return tourDriver;
};
