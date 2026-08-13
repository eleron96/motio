import React from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';

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

const { authState, plannerState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1' },
    workspacesLoaded: true,
    currentWorkspaceId: 'ws-1' as string | null,
  },
  plannerState: { loadedRange: { workspaceId: 'ws-1' } as { workspaceId: string } | null },
}));

vi.mock('@/features/auth/store/authStore', () => {
  const useAuthStore = (selector: (state: typeof authState) => unknown) => selector(authState);
  useAuthStore.getState = () => authState;
  return { useAuthStore };
});

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: { getState: () => plannerState },
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

const TestComponent = ({
  pageId,
  isAdmin,
}: {
  pageId: 'members';
  isAdmin: boolean;
}) => {
  useOnboardingTour({
    pageId,
    isAdmin,
  });

  return null;
};

describe('useOnboardingTour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    createOnboardingTourMock.mockReset();
    fetchProfilePreferencesMock.mockReset();
    updateProfilePreferencesMock.mockReset();
    driverDouble.drive.mockClear();
    driverDouble.destroy.mockClear();
    driverDouble.isActive.mockClear();
    driverDouble.isActive.mockReturnValue(false);
    createOnboardingTourMock.mockReturnValue(driverDouble);
    fetchProfilePreferencesMock.mockResolvedValue({
      onboarding_completed: false,
    });
    authState.workspacesLoaded = true;
    authState.currentWorkspaceId = 'ws-1';
    plannerState.loadedRange = { workspaceId: 'ws-1' };
  });

  it('starts the members segment once the page has had time to settle', async () => {
    render(
      <MemoryRouter>
        <TestComponent pageId="members" isAdmin />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      // The hook now dynamically imports the tour module after the 800ms
      // delay; flush the resulting microtask chain before asserting.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
    expect(createOnboardingTourMock.mock.calls[0][0]).toMatchObject({
      pageId: 'members',
      isAdmin: true,
    });
    expect(driverDouble.drive).toHaveBeenCalledTimes(1);
  });

  /**
   * Оба конца тура — «Finish» и крестик — одинаково помечают онбординг
   * пройденным и ничего больше не открывают: про примеры рассказывает
   * постоянная полоса, а не ещё одно окно поверх только что закрытого.
   */
  it.each([
    ['closed with the cross', 'onDismiss'],
    ['walked to the end', 'onComplete'],
  ] as const)('marks onboarding done and opens nothing when the tour is %s', async (_case, callback) => {
    render(
      <MemoryRouter>
        <TestComponent pageId="members" isAdmin />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    const options = createOnboardingTourMock.mock.calls[0][0] as Record<string, () => void>;
    await act(async () => {
      options[callback]();
      await Promise.resolve();
    });

    expect(updateProfilePreferencesMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ onboarding_completed: true }),
    );
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  /**
   * Первое пространство новичка создаётся уже после входа, поэтому тур,
   * стартовавший по таймеру, подсвечивал пустую сетку и «задач пока нет».
   * Теперь он ждёт готовности данных — и молчит, если они так и не приехали.
   */
  it('waits for the workspace instead of touring an empty screen', async () => {
    authState.workspacesLoaded = false;
    authState.currentWorkspaceId = null;

    render(
      <MemoryRouter>
        <TestComponent pageId="members" isAdmin />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    authState.workspacesLoaded = true;
    authState.currentWorkspaceId = 'ws-1';

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly when the workspace never arrives', async () => {
    authState.workspacesLoaded = false;
    authState.currentWorkspaceId = null;

    render(
      <MemoryRouter>
        <TestComponent pageId="members" isAdmin />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createOnboardingTourMock).not.toHaveBeenCalled();
    // Флаг «пройден» не выставлен — тур придёт в следующий заход.
    expect(updateProfilePreferencesMock).not.toHaveBeenCalled();
  });
});
