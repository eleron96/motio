import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { WorkspacePageHeader } from '@/features/workspace/components/WorkspacePageHeader';
import { MobileMenuProvider } from '@/features/workspace/components/MobileMenuContext';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import React from 'react';

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
  InviteNotifications: () => <button type="button">Notifications bell</button>,
}));

vi.mock('@/features/auth/components/AccountBadgeButton', () => ({
  AccountBadgeButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Account settings avatar
    </button>
  ),
}));

const { inboxFeed, demoState } = vi.hoisted(() => ({
  inboxFeed: { totalBadgeCount: 0, refresh: vi.fn() },
  // The base path is read from window.location, not the router, so the demo
  // sandbox has to be simulated at the hook.
  demoState: { basePath: '/app' as '/app' | '/demo' },
}));

vi.mock('@/features/demo/hooks/useIsDemo', () => ({
  useAppBasePath: () => demoState.basePath,
  useIsDemo: () => demoState.basePath === '/demo',
  isDemoRoute: () => demoState.basePath === '/demo',
  isDemoPath: (pathname: string) => pathname.startsWith('/demo'),
}));

vi.mock('@/features/auth/hooks/useInboxFeed', () => ({
  useInboxFeed: () => inboxFeed,
}));

vi.mock('@/features/auth/components/MobileNotificationsScreen', () => ({
  MobileNotificationsScreen: ({ open }: { open: boolean }) => (
    open ? <div>Notifications screen</div> : null
  ),
}));

vi.mock('@/features/workspace/components/MobileWorkspacesScreen', () => ({
  MobileWorkspacesScreen: ({ open }: { open: boolean }) => (
    open ? <div>Workspaces screen</div> : null
  ),
}));

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'niko@motio.app' },
    profileDisplayName: 'Niko',
    profileAvatarUrl: null,
    workspaces: [{ id: 'workspace-1', name: 'Motio Team' }],
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => (
    typeof selector === 'function' ? selector(authState) : authState
  ),
}));

vi.mock('@/features/planner/hooks/usePersonColors', () => ({
  usePersonColors: () => ({ byAssigneeId: new Map(), byUserId: new Map() }),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

// Mirrors WorkspaceLayout: the menu state lives above the header so settings
// screens mounted by pages can reopen the sheet.
const HeaderHost: React.FC<{
  onOpenSettings: () => void;
  onOpenAccountSettings: () => void;
}> = ({ onOpenSettings, onOpenAccountSettings }) => {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(
    () => ({ open, openMenu: () => setOpen(true), closeMenu: () => setOpen(false) }),
    [open],
  );
  return (
    <MobileMenuProvider value={value}>
      <WorkspacePageHeader
        primaryAction={<button type="button">Add task</button>}
        onOpenSettings={onOpenSettings}
        onOpenAccountSettings={onOpenAccountSettings}
      />
      <LocationProbe />
    </MobileMenuProvider>
  );
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
            <HeaderHost
              onOpenSettings={onOpenSettings}
              onOpenAccountSettings={onOpenAccountSettings}
            />
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
    inboxFeed.totalBadgeCount = 0;
    demoState.basePath = '/app';
  });

  it('opens the bottom menu sheet and closes it after navigation', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    // Section navigation lives in the always-visible pill nav, not the menu.
    // Capture the link before opening the sheet: the modal marks the rest of
    // the page aria-hidden, which would hide it from role queries afterwards.
    const projectsLink = screen.getByRole('link', { name: 'Projects' });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: /Motio Team/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Workspace settings/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Account settings/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Notifications/ })).toBeInTheDocument();

    fireEvent.click(projectsLink);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/projects');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens workspace settings from the menu and closes the sheet', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    const { onOpenSettings } = renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: /Workspace settings/ }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes on a downward flick anywhere on the sheet, and offers no close button', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    // Dismissal is the flick (and the scrim) — no corner X competing with them.
    expect(within(sheet).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    // The gesture is caught on the sheet itself, not only on the grabber.
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 180, clientY: 400 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 460 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 560 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 180, clientY: 560 });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps the sheet open when the flick is too short', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 180, clientY: 400 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 440 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 180, clientY: 440 });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('expands to full screen on a swipe up and shows the app version at the bottom', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    // The version + author footer lives in the sheet now.
    expect(within(sheet).getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'NIKO G.' })).toBeInTheDocument();

    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 180, clientY: 600 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 480 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 180, clientY: 480 });

    // Snapped to the top stop (the gap keeping the rounded corners visible).
    await waitFor(() => {
      expect(sheet.style.height).toBe('calc(100svh - 12px)');
    });

    // A short downward flick from full screen collapses without dismissing.
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 180, clientY: 300 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 380 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 180, clientY: 380 });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('still opens a row after an aborted flick', async () => {
    // A touch drag fires no click, so the click-swallow flag must be cleared by
    // the next gesture — otherwise the following tap is silently eaten.
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    const { onOpenSettings } = renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 180, clientY: 400 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 450 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 180, clientY: 450 });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /Workspace settings/ }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when the gesture is cancelled by the system', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 180, clientY: 380 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 180, clientY: 520 });
    fireEvent.pointerCancel(sheet, { pointerId: 1, clientX: 180, clientY: 520 });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps a keyboard-reachable close control', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    renderHeader('/app');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    await user.click(within(sheet).getByRole('button', { name: 'Close menu' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows the unread count on the avatar button', () => {
    useIsMobileMock.mockReturnValue(true);
    inboxFeed.totalBadgeCount = 3;

    renderHeader('/app');

    const menuButton = screen.getByRole('button', { name: 'Open menu' });
    expect(menuButton).toHaveTextContent('3');
  });

  it('hides notifications in the demo sandbox', async () => {
    useIsMobileMock.mockReturnValue(true);
    demoState.basePath = '/demo';
    const user = userEvent.setup();

    renderHeader('/demo');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
  });

  it('keeps the desktop header flow without burger menu', () => {
    useIsMobileMock.mockReturnValue(false);

    renderHeader('/app/dashboard');

    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications bell' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account settings avatar' })).toBeInTheDocument();
  });
});
