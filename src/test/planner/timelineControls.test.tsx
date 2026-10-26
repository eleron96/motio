import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TimelineControls } from '@/features/planner/components/timeline/TimelineControls';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    viewMode: 'day',
    setViewMode: vi.fn(),
    plannerSurface: 'timeline',
    setPlannerSurface: vi.fn(),
    groupMode: 'project',
    setGroupMode: vi.fn(),
    currentDate: '2026-03-20',
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    filters: {
      hideUnassigned: false,
    },
    setFilters: vi.fn(),
  },
  authState: {
    profilePreferences: null as Record<string, unknown> | null,
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: typeof plannerState) => unknown) => (
    typeof selector === 'function' ? selector(plannerState) : plannerState
  ),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector: (state: { locale: string }) => unknown) => selector({ locale: 'en' }),
}));

vi.mock('@/shared/lib/dateFnsLocale', () => ({
  resolveDateFnsLocale: () => undefined,
}));

describe('TimelineControls', () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    plannerState.viewMode = 'day';
    plannerState.plannerSurface = 'timeline';
    plannerState.groupMode = 'project';
    plannerState.currentDate = '2026-03-20';
    plannerState.filters.hideUnassigned = false;
    authState.profilePreferences = null;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('shows the view first, then the timeline settings, in the accent style when active', () => {
    render(<TimelineControls />);

    const timelineButton = screen.getByRole('button', { name: 'Timeline' });
    const projectsButton = screen.getByRole('button', { name: 'Projects' });

    expect(timelineButton).toHaveAttribute('aria-pressed', 'true');
    expect(timelineButton).toHaveClass('text-primary');
    expect(projectsButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no scale control while the Week preference is off', () => {
    authState.profilePreferences = { week_view_enabled: false };
    render(<TimelineControls />);
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Day' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument();
  });

  it('offers Day / Week as the timeline scale when the preference is on', () => {
    authState.profilePreferences = { week_view_enabled: true };
    render(<TimelineControls />);
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(plannerState.setPlannerSurface).toHaveBeenCalledWith('timeline');
    expect(plannerState.setViewMode).toHaveBeenCalledWith('week');
  });

  it('hides the timeline settings in the calendar instead of disabling them', () => {
    const { rerender } = render(<TimelineControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(plannerState.setViewMode).toHaveBeenLastCalledWith('calendar');

    plannerState.viewMode = 'calendar';
    rerender(<TimelineControls />);
    // Folded away (kept mounted so it can animate): hidden from the a11y tree
    // and out of the tab order.
    expect(screen.queryByRole('button', { name: 'People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-view-settings')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Projects', hidden: true })).toHaveAttribute('tabindex', '-1');

    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(plannerState.setViewMode).toHaveBeenLastCalledWith('day');
  });

  it('hides the Board button unless both the build flag and the preference are on', () => {
    authState.profilePreferences = { board_view_enabled: true };
    const { unmount } = render(<TimelineControls />);
    expect(screen.queryByRole('button', { name: 'Board' })).not.toBeInTheDocument();
    unmount();

    vi.stubEnv('VITE_FEATURE_KANBAN', 'true');
    authState.profilePreferences = { board_view_enabled: false };
    render(<TimelineControls />);
    expect(screen.queryByRole('button', { name: 'Board' })).not.toBeInTheDocument();
  });

  it('switches to the board as a third view and back to the timeline', () => {
    vi.stubEnv('VITE_FEATURE_KANBAN', 'true');
    authState.profilePreferences = { board_view_enabled: true };
    const { rerender } = render(<TimelineControls />);

    // One view pill: Board sits with Timeline and Calendar.
    expect(screen.getByRole('button', { name: 'Board' }).parentElement)
      .toBe(screen.getByRole('button', { name: 'Timeline' }).parentElement);

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(plannerState.setPlannerSurface).toHaveBeenCalledWith('board');

    plannerState.plannerSurface = 'board';
    rerender(<TimelineControls />);
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'false');
    // No date axis and no rows on the board: those controls are gone.
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(plannerState.setPlannerSurface).toHaveBeenLastCalledWith('timeline');
  });

  it('collapses into one "View" button with a sheet on a phone', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    render(<TimelineControls />);

    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument();
    const viewButton = screen.getByRole('button', { name: 'View' });
    expect(viewButton).toHaveTextContent('Timeline · Projects');

    fireEvent.click(viewButton);
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /People/ }));
    expect(plannerState.setGroupMode).toHaveBeenCalledWith('assignee');
    fireEvent.click(within(sheet).getByRole('button', { name: /Calendar/ }));
    expect(plannerState.setViewMode).toHaveBeenLastCalledWith('calendar');
  });
});
