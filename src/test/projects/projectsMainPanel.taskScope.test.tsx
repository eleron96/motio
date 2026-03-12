import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectsMainPanel } from '@/features/projects/components/ProjectsMainPanel';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const baseProps = {
  mode: 'projects' as const,
  selectedProject: { id: 'p1', name: 'Website redesign', code: 'WEB', color: '#3b82f6', customerId: 'c1', archived: false } as never,
  customerById: new Map([['c1', { id: 'c1', name: 'Acme' } as never]]),
  search: '',
  onSearchChange: vi.fn(),
  statusFilterLabel: 'All statuses',
  setStatusPreset: vi.fn(),
  statuses: [{ id: 's1', name: 'In progress', emoji: null } as never],
  statusFilterIds: [],
  onToggleStatus: vi.fn(),
  assigneeFilterLabel: 'All assignees',
  assigneeOptions: [{ id: 'a1', name: 'Alexandra Robertson', isActive: true } as never],
  assigneeFilterIds: [],
  onToggleAssignee: vi.fn(),
  onClearFilters: vi.fn(),
  selectedProjectId: 'p1',
  onRefreshTasks: vi.fn(),
  tasksLoading: false,
  tasksError: '',
  displayTaskRows: [
    {
      key: 'task-1',
      task: {
        id: 'task-1',
        title: 'Plan launch communication',
        statusId: 's1',
        assigneeIds: ['a1'],
        startDate: '2026-03-10',
        endDate: '2026-03-12',
      } as never,
      repeatMeta: null,
    },
  ],
  taskScopePageSize: 100,
  displayTotalCount: 1,
  pageIndex: 1,
  totalPages: 1,
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
  statusById: new Map([['s1', { id: 's1', name: 'In progress', emoji: null } as never]]),
  assigneeById: new Map([['a1', { id: 'a1', name: 'Alexandra Robertson', isActive: true } as never]]),
  onSelectTask: vi.fn(),
  selectedMilestone: null,
  selectedMilestoneProject: null,
  selectedMilestoneCustomer: null,
  formatMilestoneDate: vi.fn(),
  trackedProjectIdSet: new Set<string>(),
  onOpenProjectFromMilestone: vi.fn(),
  onOpenMilestoneSettings: vi.fn(),
  onRequestDeleteMilestone: vi.fn(),
  canEdit: true,
  selectedCustomer: null,
  selectedCustomerProjects: [],
  customersCount: 1,
  onOpenProjectFromCustomer: vi.fn(),
};

describe('ProjectsMainPanel task scope', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
    useIsMobileMock.mockReturnValue(false);
  });

  it('calls the scope change handler when switching to past tasks', async () => {
    const user = userEvent.setup();
    const onChangeTaskScope = vi.fn();

    render(
      <ProjectsMainPanel
        {...baseProps}
        taskScope="current"
        onChangeTaskScope={onChangeTaskScope}
        pastFromDate=""
        onPastFromDateChange={vi.fn()}
        pastToDate=""
        onPastToDateChange={vi.fn()}
        pastSort="end_desc"
        onPastSortChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Past' }));

    expect(onChangeTaskScope).toHaveBeenCalledWith('past');
  });

  it('shows past filters and pagination only in past scope', () => {
    render(
      <ProjectsMainPanel
        {...baseProps}
        taskScope="past"
        onChangeTaskScope={vi.fn()}
        pastFromDate="2026-01-01"
        onPastFromDateChange={vi.fn()}
        pastToDate="2026-01-31"
        onPastToDateChange={vi.fn()}
        pastSort="end_desc"
        onPastSortChange={vi.fn()}
        displayTotalCount={120}
        totalPages={2}
      />,
    );

    expect(screen.getByDisplayValue('2026-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-01-31')).toBeInTheDocument();
    expect(screen.getByText('1–100 of 120')).toBeInTheDocument();
    expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
  });
});
