import { describe, expect, it, beforeEach, vi } from 'vitest';
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
  selectedProject: {
    id: 'p1',
    name: 'Helsinki tower',
    code: 'HEL',
    color: '#3b82f6',
    customerId: 'c1',
    archived: false,
    status: 'IN PROGRESS',
    ownerGroupId: null,
  } as never,
  customerById: new Map([['c1', { id: 'c1', name: 'Acme', industry: null } as never]]),
  taskScope: 'current' as const,
  onChangeTaskScope: vi.fn(),
  search: '',
  onSearchChange: vi.fn(),
  statusFilterLabel: 'All statuses',
  setStatusPreset: vi.fn(),
  statuses: [] as never,
  statusFilterIds: [] as string[],
  onToggleStatus: vi.fn(),
  assigneeFilterLabel: 'All assignees',
  assigneeOptions: [] as never,
  assigneeFilterIds: [] as string[],
  onToggleAssignee: vi.fn(),
  onClearFilters: vi.fn(),
  onRefreshTasks: vi.fn(),
  tasksLoading: false,
  tasksError: '',
  displayTaskRows: [] as never,
  displayTotalCount: 0,
  pageIndex: 1,
  totalPages: 1,
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
  statusById: new Map(),
  assigneeById: new Map(),
  onSelectTask: vi.fn(),
  selectedMilestone: null,
  selectedMilestoneProject: null,
  selectedMilestoneCustomer: null,
  formatMilestoneDate: vi.fn(() => ''),
  trackedProjectIdSet: new Set<string>(),
  onOpenProjectFromMilestone: vi.fn(),
  onOpenMilestoneSettings: vi.fn(),
  onRequestDeleteMilestone: vi.fn(),
  canEdit: true,
  selectedCustomer: null,
  selectedCustomerProjects: [] as never,
  customersCount: 1,
  onOpenProjectFromCustomer: vi.fn(),
  onStartCustomerEdit: vi.fn(),
  onRequestDeleteCustomer: vi.fn(),
  projectMembers: [] as never,
  projectMilestones: [] as never,
  today: new Date('2026-05-08'),
  onCreateMilestoneForProject: vi.fn(),
  onEditMilestone: vi.fn(),
  onSaveProjectStatus: vi.fn(async () => true),
  onToggleProjectTracked: vi.fn(),
  onOpenProjectSettings: vi.fn(),
  onToggleProjectArchived: vi.fn(),
  onRequestDeleteProject: vi.fn(),
  customerContacts: [] as never,
  onAddCustomerContact: vi.fn(async () => true),
  onDeleteCustomerContact: vi.fn(async () => true),
  onUpdateCustomerContact: vi.fn(async () => true),
  projectMemberRows: [] as never,
  workspaceAssignees: [] as never,
  onAddProjectMember: vi.fn(async () => true),
  onRemoveProjectMember: vi.fn(async () => true),
  onUpdateAssigneeContact: vi.fn(async () => true),
  onUpdateExternalMember: vi.fn(async () => true),
  projectActivity: [] as never,
  formatActivityTimestamp: vi.fn(() => '8 May 2026, 10:00'),
  onAddProjectActivity: vi.fn(async () => true),
  onUpdateProjectActivity: vi.fn(async () => true),
  onDeleteProjectActivity: vi.fn(async () => true),
  onSetProjectActivityPinned: vi.fn(async () => true),
};

describe('ProjectsMainPanel — project card on mobile', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
    useIsMobileMock.mockReturnValue(true);
  });

  it('renders the project card', () => {
    render(<ProjectsMainPanel {...baseProps} />);

    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('offers every add button', () => {
    render(<ProjectsMainPanel {...baseProps} />);

    expect(screen.getByLabelText('Add note')).toBeInTheDocument();
    expect(screen.getByLabelText('Add team member')).toBeInTheDocument();
    expect(screen.getByLabelText('Add milestone')).toBeInTheDocument();
    // CustomerBlock renders only for a project with a customer: baseProps points at "c1".
    expect(screen.getByLabelText('Add customer contact')).toBeInTheDocument();
  });

  it('keeps the project-status chip interactive', () => {
    render(<ProjectsMainPanel {...baseProps} />);

    // On a phone the chip opens a bottom sheet; same label as on desktop, not disabled.
    const chip = screen.getByRole('button', { name: 'Edit project status: IN PROGRESS' });
    expect(chip).not.toBeDisabled();
  });
});

describe('ProjectsMainPanel — task scope in the project card', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
    useIsMobileMock.mockReturnValue(false);
  });

  it('switches to past tasks', async () => {
    const user = userEvent.setup();
    const onChangeTaskScope = vi.fn();

    render(<ProjectsMainPanel {...baseProps} taskScope="current" onChangeTaskScope={onChangeTaskScope} />);
    await user.click(screen.getByRole('button', { name: 'Past' }));

    expect(onChangeTaskScope).toHaveBeenCalledWith('past');
  });

  it('pages through past tasks only', () => {
    const { rerender } = render(
      <ProjectsMainPanel {...baseProps} taskScope="past" displayTotalCount={120} totalPages={2} />,
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    rerender(<ProjectsMainPanel {...baseProps} taskScope="current" displayTotalCount={120} totalPages={2} />);
    expect(screen.queryByText('Page 1 of 2')).not.toBeInTheDocument();
  });
});
