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

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({
    user: { id: 'user-1' },
  }),
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
  prepareMembersAccess,
}: {
  pageId: 'members';
  isAdmin: boolean;
  prepareMembersAccess: () => void;
}) => {
  useOnboardingTour({
    pageId,
    isAdmin,
    prepareMembersAccess,
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
  });

  it('opens Team access before starting the members admin segment', async () => {
    const prepareMembersAccess = vi.fn();

    render(
      <MemoryRouter>
        <TestComponent
          pageId="members"
          isAdmin
          prepareMembersAccess={prepareMembersAccess}
        />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(prepareMembersAccess).toHaveBeenCalledTimes(1);
    expect(createOnboardingTourMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      // The hook now dynamically imports the tour module after the 800ms
      // delay; flush the resulting microtask chain before asserting.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createOnboardingTourMock).toHaveBeenCalledTimes(1);
    expect(driverDouble.drive).toHaveBeenCalledTimes(1);
    expect(prepareMembersAccess.mock.invocationCallOrder[0]).toBeLessThan(
      createOnboardingTourMock.mock.invocationCallOrder[0],
    );
  });
});
