import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { WorkspacePageHeader } from '@/features/workspace/components/WorkspacePageHeader';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('@/features/workspace/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <button type="button">Workspace switcher</button>,
}));

vi.mock('@/features/auth/components/InviteNotifications', () => ({
  InviteNotifications: () => <button type="button">Notifications</button>,
}));

vi.mock('@/features/auth/components/AccountBadgeButton', () => ({
  AccountBadgeButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Account settings avatar
    </button>
  ),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderHeader = (initialPath = '/app') => {
  const onOpenSettings = vi.fn();
  const onOpenAccountSettings = vi.fn();

  const view = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <WorkspacePageHeader
                primaryAction={<button type="button">Add task</button>}
                onOpenSettings={onOpenSettings}
                onOpenAccountSettings={onOpenAccountSettings}
              />
              <LocationProbe />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );

  return { ...view, onOpenSettings, onOpenAccountSettings };
};

describe('WorkspacePageHeader mobile menu', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('opens the mobile drawer and closes it after navigation', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    // Section navigation now lives in the always-visible pill nav, not the drawer.
    // Capture the link before opening the drawer: the modal marks the rest of
    // the page aria-hidden, which would hide it from role queries afterwards.
    const projectsLink = screen.getByRole('link', { name: 'Projects' });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workspace settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account settings' })).toBeInTheDocument();

    // Navigating to another section auto-closes the drawer. Dispatch the click
    // directly to exercise the route-change handler rather than the overlay's
    // hit-testing.
    fireEvent.click(projectsLink);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/projects');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps long workspace actions readable in the mobile drawer', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const settingsButton = await screen.findByRole('button', { name: 'Workspace settings' });
    const accountButton = screen.getByRole('button', { name: 'Account settings' });

    expect(settingsButton).toHaveClass('h-auto', 'whitespace-normal', 'text-left');
    expect(accountButton).toHaveClass('h-auto', 'whitespace-normal', 'text-left');
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.queryByText('Navigate between workspace sections and account tools.')).not.toBeInTheDocument();
  });

  it('keeps the desktop header flow without burger menu', () => {
    useIsMobileMock.mockReturnValue(false);

    renderHeader('/app/dashboard');

    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account settings avatar' })).toBeInTheDocument();
  });
});
