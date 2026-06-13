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
    plannerState.groupMode = 'project';
    plannerState.currentDate = '2026-03-20';
    plannerState.filters.hideUnassigned = false;
    authState.profilePreferences = null;
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
});
