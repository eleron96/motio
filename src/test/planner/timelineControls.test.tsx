import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  beforeEach(() => {
    plannerState.viewMode = 'day';
    plannerState.plannerSurface = 'timeline';
    plannerState.groupMode = 'project';
    plannerState.currentDate = '2026-03-20';
    plannerState.filters.hideUnassigned = false;
    authState.profilePreferences = null;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('uses the accent active style for the selected timeline mode buttons', () => {
    render(<TimelineControls />);

    const dayButton = screen.getByRole('button', { name: 'Day' });
    const projectsButton = screen.getByRole('button', { name: 'Projects' });

    expect(dayButton).toHaveClass('bg-primary/15', 'text-primary');
    expect(dayButton).not.toHaveClass('bg-foreground');
    expect(projectsButton).toHaveClass('bg-primary/15', 'text-primary');
    expect(projectsButton).not.toHaveClass('bg-foreground');
  });

  it('hides the Week view button when the preference is off', () => {
    authState.profilePreferences = { week_view_enabled: false };
    render(<TimelineControls />);
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument();
  });

  it('shows the Week view button when the preference is on', () => {
    authState.profilePreferences = { week_view_enabled: true };
    render(<TimelineControls />);
    const weekButton = screen.getByRole('button', { name: 'Week' });
    expect(weekButton).toBeInTheDocument();
    fireEvent.click(weekButton);
    expect(plannerState.setViewMode).toHaveBeenCalledWith('week');
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

  it('switches to the board and back to the timeline scale the person picks', () => {
    vi.stubEnv('VITE_FEATURE_KANBAN', 'true');
    authState.profilePreferences = { board_view_enabled: true };
    const { rerender } = render(<TimelineControls />);

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(plannerState.setPlannerSurface).toHaveBeenCalledWith('board');

    plannerState.plannerSurface = 'board';
    rerender(<TimelineControls />);
    expect(screen.getByRole('button', { name: 'Board' })).toHaveClass('bg-primary/15');
    expect(screen.getByRole('button', { name: 'Day' })).not.toHaveClass('bg-primary/15');
    // No date axis on the board: grouping is off, the arrows are gone.
    expect(screen.getByRole('button', { name: 'Projects' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(plannerState.setPlannerSurface).toHaveBeenLastCalledWith('timeline');
    expect(plannerState.setViewMode).toHaveBeenLastCalledWith('day');
  });
});
