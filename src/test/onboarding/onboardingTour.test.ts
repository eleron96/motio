import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveStep } from 'driver.js';
import { buildOnboardingSteps, createOnboardingTour } from '@/features/onboarding/lib/onboardingTour';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { driverMock } = vi.hoisted(() => ({
  driverMock: vi.fn(),
}));

vi.mock('driver.js', () => ({
  driver: (config: unknown) => driverMock(config),
}));

const createPopoverDom = () => {
  const footer = document.createElement('div');
  const progress = document.createElement('span');
  const footerButtons = document.createElement('div');
  const previousButton = document.createElement('button');
  const nextButton = document.createElement('button');

  footerButtons.appendChild(previousButton);
  footerButtons.appendChild(nextButton);
  footer.appendChild(progress);
  footer.appendChild(footerButtons);

  return {
    wrapper: document.createElement('div'),
    arrow: document.createElement('div'),
    title: document.createElement('div'),
    description: document.createElement('div'),
    footer,
    progress,
    previousButton,
    nextButton,
    closeButton: document.createElement('button'),
    footerButtons,
  };
};

const baseArgs = {
  canEdit: true,
  isAdmin: false,
  groupMode: 'assignee' as const,
  undoShortcut: '⌘Z',
};

const titles = (steps: DriveStep[]) => steps.map((step) => step.popover?.title);

describe('buildOnboardingSteps', () => {
  /**
   * The tour teaches the timeline on the timeline: every step is about the
   * screen the newcomer will work on, and none of them navigates away — the
   * old tour ended on the Team page, four screens from where work happens.
   */
  it('walks an editor through the timeline without leaving it', () => {
    const steps = buildOnboardingSteps(baseArgs);

    expect(titles(steps)).toEqual([
      "Your team's shared timeline",
      'Double-click a day to add a task',
      'Drag to reschedule',
      'Milestones: deadlines for everyone',
      'People or projects',
      'The rest is up here',
    ]);
    expect(steps.some((step) => step.popover?.onNextClick)).toBe(false);
  });

  it('leaves out adding and dragging for a viewer', () => {
    const steps = buildOnboardingSteps({ ...baseArgs, canEdit: false });

    expect(titles(steps)).toEqual([
      "Your team's shared timeline",
      'Click a task to open it',
      'Milestones: deadlines for everyone',
      'People or projects',
      'The rest is up here',
    ]);
    expect(steps.map((step) => step.popover?.description).join(' ')).not.toMatch(/double-click/i);
  });

  it('names the undo shortcut of the platform', () => {
    const steps = buildOnboardingSteps({ ...baseArgs, undoShortcut: 'Ctrl+Z' });
    const drag = steps.find((step) => step.popover?.title === 'Drag to reschedule');

    expect(drag?.popover?.description).toContain('Moved it by mistake? Ctrl+Z.');
  });

  it('describes project rows when the timeline is grouped by project', () => {
    const steps = buildOnboardingSteps({ ...baseArgs, groupMode: 'project' });

    expect(steps[0].popover?.description).toMatch(/^Each row is a project/);
    expect(steps[1].popover?.description).toMatch(/project's row/);
    expect(steps.find((step) => step.popover?.title === 'People or projects')?.popover?.description)
      .toMatch(/^Switch to People/);
  });

  it('tells only an admin where invitations live', () => {
    const lastFor = (isAdmin: boolean) => buildOnboardingSteps({ ...baseArgs, isAdmin }).at(-1)?.popover?.description;

    expect(lastFor(true)).toContain('the gear next to the workspace name');
    expect(lastFor(false)).not.toContain('gear');
  });

  /**
   * A row is as wide as the whole loaded range; driver.js would scroll it to
   * its middle, months away from today. Rows are pointed at through a stand-in
   * laid over the part of the row on screen.
   */
  it('spotlights only the visible part of a timeline row', () => {
    document.body.innerHTML = `
      <div data-tour="timeline-grid"></div>
      <div data-tour="timeline-first-row"></div>
    `;
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    const timeline = document.querySelector<HTMLElement>('[data-tour="timeline-grid"]')!;
    const row = document.querySelector<HTMLElement>('[data-tour="timeline-first-row"]')!;
    timeline.getBoundingClientRect = () => ({ left: 60, top: 100, right: 1200, bottom: 900, width: 1140, height: 800 }) as DOMRect;
    Object.defineProperty(timeline, 'clientWidth', { value: 1130 });
    Object.defineProperty(timeline, 'clientHeight', { value: 790 });
    row.getBoundingClientRect = () => ({ left: -9000, top: 180, right: 30000, bottom: 260, width: 39000, height: 80 }) as DOMRect;

    const step = buildOnboardingSteps(baseArgs)[1];
    const target = (step.element as () => HTMLElement)();

    expect(target).not.toBe(row);
    expect(target.style.position).toBe('fixed');
    expect([target.style.left, target.style.top, target.style.width, target.style.height])
      .toEqual(['60px', '180px', '1130px', '80px']);
  });

  /**
   * Most bars are longer than the days in view. Asking for a bar seen whole
   * found none in the demo, and the tip about dragging hung in the middle of
   * the screen; the stand-in now covers the visible part of a bar whose start
   * is in view.
   */
  it('points at the visible part of a bar that starts on screen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    document.body.innerHTML = `
      <div data-tour="timeline-grid">
        <div data-timeline-sidebar="header"></div>
        <div class="task-bar" data-task-id="started-earlier"></div>
        <div class="task-bar" data-task-id="starts-in-view"></div>
        <div class="task-bar" data-task-id="under-the-header"></div>
      </div>
    `;
    const rect = (left: number, top: number, right: number, bottom: number) => (
      () => ({ left, top, right, bottom, width: right - left, height: bottom - top }) as DOMRect
    );
    const timeline = document.querySelector<HTMLElement>('[data-tour="timeline-grid"]')!;
    timeline.getBoundingClientRect = rect(48, 100, 1430, 900);
    Object.defineProperty(timeline, 'clientWidth', { value: 1366 });
    Object.defineProperty(timeline, 'clientHeight', { value: 800 });
    document.querySelector<HTMLElement>('[data-timeline-sidebar="header"]')!.getBoundingClientRect = rect(48, 100, 408, 280);
    const bar = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
    bar('started-earlier').getBoundingClientRect = rect(-600, 300, 900, 340);
    bar('starts-in-view').getBoundingClientRect = rect(648, 436, 2564, 476);
    bar('under-the-header').getBoundingClientRect = rect(500, 200, 700, 240);

    const step = buildOnboardingSteps(baseArgs).find((item) => item.popover?.title === 'Drag to reschedule');
    const target = (step?.element as () => HTMLElement)();

    expect([target.style.left, target.style.top, target.style.width, target.style.height])
      .toEqual(['648px', '436px', '766px', '40px']);
  });

  it('lights the workspace gear together with the menu for an admin', () => {
    document.body.innerHTML = '<button data-tour="settings-btn"></button><nav data-tour="nav-bar"></nav>';
    const rect = (left: number, top: number, right: number, bottom: number) => (
      () => ({ left, top, right, bottom, width: right - left, height: bottom - top }) as DOMRect
    );
    document.querySelector<HTMLElement>('[data-tour="settings-btn"]')!.getBoundingClientRect = rect(220, 60, 252, 92);
    document.querySelector<HTMLElement>('[data-tour="nav-bar"]')!.getBoundingClientRect = rect(280, 56, 740, 96);

    const adminTarget = (buildOnboardingSteps({ ...baseArgs, isAdmin: true }).at(-1)?.element as () => HTMLElement)();
    expect([adminTarget.style.left, adminTarget.style.top, adminTarget.style.width, adminTarget.style.height])
      .toEqual(['220px', '56px', '520px', '40px']);
    expect(buildOnboardingSteps(baseArgs).at(-1)?.element).toBe('[data-tour="nav-bar"]');
  });

  it('falls back to a centred tip when no task bar is on screen', () => {
    document.body.innerHTML = '<div data-tour="timeline-grid"></div>';
    const step = buildOnboardingSteps(baseArgs).find((item) => item.popover?.title === 'Drag to reschedule');

    expect((step?.element as () => Element | undefined)()).toBeUndefined();
  });
});

describe('createOnboardingTour', () => {
  let capturedConfig: Record<string, unknown>;
  const driverDouble = { destroy: vi.fn(), drive: vi.fn(), isActive: vi.fn(() => true) };

  beforeEach(() => {
    capturedConfig = {};
    driverDouble.destroy.mockClear();
    driverMock.mockReset();
    driverMock.mockImplementation((config: Record<string, unknown>) => {
      capturedConfig = config;
      return driverDouble;
    });
  });

  it('renders an explicit Skip button that ends the tour', () => {
    const onClose = vi.fn();
    createOnboardingTour({ ...baseArgs, onClose });

    const popover = createPopoverDom();
    (capturedConfig.onPopoverRender as (popoverDom: typeof popover) => void)(popover);

    const skipButton = popover.footer.querySelector<HTMLButtonElement>('.motio-tour-skip-btn');
    expect(skipButton?.textContent).toBe('Skip');
    expect(skipButton?.getAttribute('aria-label')).toBe('Skip');

    skipButton?.click();
    expect(driverDouble.destroy).toHaveBeenCalledTimes(1);

    (capturedConfig.onDestroyed as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks on the dim overlay and on the highlighted element', () => {
    createOnboardingTour({ ...baseArgs, onClose: vi.fn() });

    (capturedConfig.overlayClickBehavior as () => void)();
    expect(driverDouble.destroy).not.toHaveBeenCalled();
    // A double-click on the spotlit row would open the task form under the tour.
    expect(capturedConfig.disableActiveInteraction).toBe(true);
  });

  it('removes the row stand-in once the tour is over', () => {
    document.body.innerHTML = '<div id="motio-tour-spotlight"></div>';
    createOnboardingTour({ ...baseArgs, onClose: vi.fn() });

    (capturedConfig.onDestroyed as () => void)();
    expect(document.getElementById('motio-tour-spotlight')).toBeNull();
  });
});
