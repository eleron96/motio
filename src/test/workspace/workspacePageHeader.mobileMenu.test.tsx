import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    expect(screen.getByText('Timeline')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Projects' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/projects');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('keeps long workspace actions readable in the mobile drawer', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    const settingsButton = await screen.findByRole('button', { name: 'Workspace settings' });
    const accountButton = screen.getByRole('button', { name: 'Account settings' });

    expect(settingsButton).toHaveClass('h-auto', 'whitespace-normal', 'text-left');
    expect(accountButton).toHaveClass('h-auto', 'whitespace-normal', 'text-left');
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
  });

  it('keeps the desktop header flow without burger menu', () => {
    useIsMobileMock.mockReturnValue(false);

    renderHeader('/app/dashboard');

    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account settings avatar' })).toBeInTheDocument();
  });
});
