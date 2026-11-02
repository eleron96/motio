import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingTour, type MobileIntroState } from '@/features/onboarding/hooks/useOnboardingTour';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const {
  createOnboardingTourMock,
  fetchProfilePreferencesMock,
  updateProfilePreferencesMock,
} = vi.hoisted(() => ({
  createOnboardingTourMock: vi.fn(),
  fetchProfilePreferencesMock: vi.fn(),
  updateProfilePreferencesMock: vi.fn(),
}));

const { authState, plannerState, mobileState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1' },
    workspacesLoaded: true,
    currentWorkspaceId: 'ws-1' as string | null,
  },
  plannerState: {
    loadedRange: { workspaceId: 'ws-1' } as { workspaceId: string } | null,
    plannerSurface: 'timeline' as 'timeline' | 'board',
    viewMode: 'day' as 'day' | 'week' | 'calendar',
    groupMode: 'assignee' as 'assignee' | 'project',
    setPlannerSurface: vi.fn(),
    setViewMode: vi.fn(),
  },
  mobileState: { isMobile: false },
}));

vi.mock('@/features/auth/store/authStore', () => {
  const useAuthStore = (selector: (state: typeof authState) => unknown) => selector(authState);
  useAuthStore.getState = () => authState;
  return { useAuthStore };
});

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: { getState: () => plannerState },
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => mobileState.isMobile,
}));

vi.mock('@/features/onboarding/lib/onboardingTour', () => ({
  createOnboardingTour: (...args: unknown[]) => createOnboardingTourMock(...args),
}));

// driver.js styles are dynamically imported alongside the tour module; stub
// the CSS module out so the dynamic import doesn't throw in the jsdom env.
vi.mock('driver.js/dist/driver.css', () => ({}));

vi.mock('@/infrastructure/auth/onboardingPreferencesRepository', () => ({
  fetchProfilePreferences: (...args: unknown[]) => fetchProfilePreferencesMock(...args),
  updateProfilePreferences: (...args: unknown[]) => updateProfilePreferencesMock(...args),
}));

const driverDouble = {
  drive: vi.fn(),
  destroy: vi.fn(),
  isActive: vi.fn(() => false),
};

let latest: { mobileIntro: MobileIntroState; closeMobileIntro: () => void };

const TestComponent = ({ canEdit = true, isAdmin = false }: { canEdit?: boolean; isAdmin?: boolean }) => {
  latest = useOnboardingTour({ canEdit, isAdmin });
  return null;
};

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    // The tour module is imported dynamically after the delay; let that
    // microtask chain settle before asserting.
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useOnboardingTour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createOnboardingTourMock.mockReset();
    fetchProfilePreferencesMock.mockReset();
    updateProfilePreferencesMock.mockReset();
    driverDouble.drive.mockClear();
    driverDouble.destroy.mockClear();
    driverDouble.isActive.mockReturnValue(false);
    createOnboardingTourMock.mockReturnValue(driverDouble);
    fetchProfilePreferencesMock.mockResolvedValue({ onboarding_completed: false, theme: 'warm' });
    authState.workspacesLoaded = true;
    authState.currentWorkspaceId = 'ws-1';
    plannerState.loadedRange = { workspaceId: 'ws-1' };
    plannerState.plannerSurface = 'timeline';
    plannerState.viewMode = 'day';
    plannerState.groupMode = 'assignee';
    plannerState.setPlannerSurface.mockClear();
    plannerState.setViewMode.mockClear();
    mobileState.isMobile = false;
  });

  it('starts the timeline tour once the page has had time to settle', async () => {
    render(<TestComponent isAdmin />);
    await act(async () => { await Promise.resolve(); });

    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    await flush(800);

    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
    expect(createOnboardingTourMock.mock.calls[0][0]).toMatchObject({
      canEdit: true,
      isAdmin: true,
      groupMode: 'assignee',
    });
    expect(driverDouble.drive).toHaveBeenCalledTimes(1);
  });

  it('stays silent for someone who has already met the timeline', async () => {
    fetchProfilePreferencesMock.mockResolvedValue({ onboarding_completed: true });
    render(<TestComponent />);
    await flush(2000);

    expect(createOnboardingTourMock).not.toHaveBeenCalled();
    expect(latest.mobileIntro).toBe('hidden');
  });

  /**
   * Closing the tour any way marks it done — and keeps the rest of the
   * profile: preferences are re-read, so a setting changed during the tour
   * isn't rolled back to the snapshot taken when it started.
   */
  it('marks onboarding done on close without losing other preferences', async () => {
    render(<TestComponent />);
    await flush(800);

    fetchProfilePreferencesMock.mockResolvedValue({ onboarding_completed: false, theme: 'cool' });
    const { onClose } = createOnboardingTourMock.mock.calls[0][0] as { onClose: () => void };
    await act(async () => {
      onClose();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateProfilePreferencesMock).toHaveBeenCalledWith('user-1', {
      onboarding_completed: true,
      theme: 'cool',
    });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('does not count a tour torn down with the page as finished', async () => {
    driverDouble.isActive.mockReturnValue(true);
    driverDouble.destroy.mockImplementation(() => {
      (createOnboardingTourMock.mock.calls[0][0] as { onClose: () => void }).onClose();
    });
    const { unmount } = render(<TestComponent />);
    await flush(800);

    unmount();
    await act(async () => { await Promise.resolve(); });

    expect(driverDouble.destroy).toHaveBeenCalledTimes(1);
    expect(updateProfilePreferencesMock).not.toHaveBeenCalled();
    driverDouble.destroy.mockReset();
  });

  /**
   * Someone coming back to the tour from settings may have left the planner on
   * the calendar or the board, where the rows and bars it points at don't exist.
   */
  it('brings the timeline back before touring it', async () => {
    plannerState.plannerSurface = 'board';
    plannerState.viewMode = 'calendar';
    render(<TestComponent />);
    await flush(800);

    expect(plannerState.setPlannerSurface).toHaveBeenCalledWith('timeline');
    expect(plannerState.setViewMode).toHaveBeenCalledWith('day');
    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    await flush(350);
    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
  });

  it('waits for the workspace instead of touring an empty screen', async () => {
    authState.workspacesLoaded = false;
    authState.currentWorkspaceId = null;
    render(<TestComponent />);
    await flush(3000);

    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    authState.workspacesLoaded = true;
    authState.currentWorkspaceId = 'ws-1';
    await flush(400);

    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly when the workspace never arrives', async () => {
    authState.workspacesLoaded = false;
    authState.currentWorkspaceId = null;
    render(<TestComponent />);
    await flush(20000);

    expect(createOnboardingTourMock).not.toHaveBeenCalled();
    // Флаг «пройден» не выставлен — тур придёт в следующий заход.
    expect(updateProfilePreferencesMock).not.toHaveBeenCalled();
  });

  it('waits for an open dialog such as the daily brief to close', async () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    render(<TestComponent />);
    await flush(3000);

    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    await flush(400);
    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A phone gets cards instead of the tour: the tour's anchors live in the
   * desktop layout only. The cards open the same way — after the data and any
   * dialog — and closing them marks onboarding done.
   */
  it('opens the phone cards instead of the tour on a phone', async () => {
    mobileState.isMobile = true;
    render(<TestComponent />);
    await flush(800);

    expect(createOnboardingTourMock).not.toHaveBeenCalled();
    expect(latest.mobileIntro).toBe('open');

    await act(async () => {
      latest.closeMobileIntro();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest.mobileIntro).toBe('closed');
    expect(updateProfilePreferencesMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ onboarding_completed: true }),
    );
  });
});
