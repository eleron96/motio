import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineControls } from '@/features/planner/components/timeline/TimelineControls';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { plannerState } = vi.hoisted(() => ({
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
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: typeof plannerState) => unknown) => (
    typeof selector === 'function' ? selector(plannerState) : plannerState
  ),
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
    vi.clearAllMocks();
  });

  it('uses the shared dark active style for the selected timeline mode buttons', () => {
    render(<TimelineControls />);

    const dayButton = screen.getByRole('button', { name: 'Day' });
    const projectsButton = screen.getByRole('button', { name: 'Projects' });

    expect(dayButton).toHaveClass('bg-foreground', 'text-background', 'shadow-sm');
    expect(dayButton).not.toHaveClass('bg-background');
    expect(projectsButton).toHaveClass('bg-foreground', 'text-background', 'shadow-sm');
    expect(projectsButton).not.toHaveClass('bg-background');
  });

  it('no longer offers a Week view button', () => {
    render(<TimelineControls />);
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument();
  });
});
