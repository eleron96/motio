import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingTour } from '@/features/onboarding/lib/onboardingTour';

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

type DriverDouble = {
  destroy: ReturnType<typeof vi.fn>;
  drive: ReturnType<typeof vi.fn>;
  moveNext: ReturnType<typeof vi.fn>;
  isActive: ReturnType<typeof vi.fn>;
};

const createDriverDouble = (): DriverDouble & Record<string, ReturnType<typeof vi.fn>> => ({
  destroy: vi.fn(),
  drive: vi.fn(),
  moveNext: vi.fn(),
  isActive: vi.fn(() => true),
  refresh: vi.fn(),
  setConfig: vi.fn(),
  setSteps: vi.fn(),
  getConfig: vi.fn(),
  getState: vi.fn(),
  getActiveIndex: vi.fn(),
  isFirstStep: vi.fn(),
  isLastStep: vi.fn(),
  getActiveStep: vi.fn(),
  getActiveElement: vi.fn(),
  getPreviousElement: vi.fn(),
  getPreviousStep: vi.fn(),
  movePrevious: vi.fn(),
  moveTo: vi.fn(),
  hasNextStep: vi.fn(),
  hasPreviousStep: vi.fn(),
  highlight: vi.fn(),
});

const createPopoverDom = () => ({
  wrapper: document.createElement('div'),
  arrow: document.createElement('div'),
  title: document.createElement('div'),
  description: document.createElement('div'),
  footer: document.createElement('div'),
  progress: document.createElement('span'),
  previousButton: document.createElement('button'),
  nextButton: document.createElement('button'),
  closeButton: document.createElement('button'),
  footerButtons: document.createElement('div'),
});

describe('createOnboardingTour', () => {
  let capturedConfig: Record<string, unknown>;
  let driverDouble: ReturnType<typeof createDriverDouble>;

  beforeEach(() => {
    vi.useRealTimers();
    driverDouble = createDriverDouble();
    capturedConfig = {};
    driverMock.mockReset();
    driverMock.mockImplementation((config: Record<string, unknown>) => {
      capturedConfig = config;
      return driverDouble;
    });
  });

  it('renders an explicit Skip button and treats it as dismissal', () => {
    const onDismiss = vi.fn();

    createOnboardingTour({
      pageId: 'planner',
      onAdvance: vi.fn(),
      onDismiss,
      onComplete: vi.fn(),
    });

    const popover = createPopoverDom();
    (capturedConfig.onPopoverRender as ((popoverDom: typeof popover) => void) | undefined)?.(popover);

    const skipButton = popover.footerButtons.querySelector<HTMLButtonElement>('.motio-tour-skip-btn');
    expect(skipButton?.textContent).toBe('Skip');

    skipButton?.click();
    expect(driverDouble.destroy).toHaveBeenCalledTimes(1);

    (capturedConfig.onDestroyed as (() => void) | undefined)?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('advances planner tour to dashboard on the last step', () => {
    const onAdvance = vi.fn();

    createOnboardingTour({
      pageId: 'planner',
      onAdvance,
      onDismiss: vi.fn(),
      onComplete: vi.fn(),
    });

    const steps = capturedConfig.steps as Array<{
      popover?: { onNextClick?: (...args: unknown[]) => void };
    }>;
    const lastStep = steps.at(-1);

    lastStep?.popover?.onNextClick?.();
    expect(driverDouble.destroy).toHaveBeenCalledTimes(1);

    (capturedConfig.onDestroyed as (() => void) | undefined)?.();
    expect(onAdvance).toHaveBeenCalledWith('dashboard');
  });

  it('opens Team access before moving to the add member step', () => {
    vi.useFakeTimers();
    const prepareMembersAccess = vi.fn();

    createOnboardingTour({
      pageId: 'members',
      isAdmin: true,
      prepareMembersAccess,
      onAdvance: vi.fn(),
      onDismiss: vi.fn(),
      onComplete: vi.fn(),
    });

    const steps = capturedConfig.steps as Array<{
      popover?: { onNextClick?: (...args: unknown[]) => void };
    }>;
    const firstStep = steps[0];

    firstStep.popover?.onNextClick?.(
      undefined,
      undefined,
      { driver: driverDouble },
    );

    expect(prepareMembersAccess).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(driverDouble.moveNext).toHaveBeenCalledTimes(1);
  });
});
