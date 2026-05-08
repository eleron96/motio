import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectsMainPanel } from '@/features/projects/components/ProjectsMainPanel';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { isProjectCardEnabled, isProjectCardMobileEnabled } from '@/shared/lib/featureFlags';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('@/shared/lib/featureFlags', () => ({
  isProjectCardEnabled: vi.fn(),
  isProjectCardMobileEnabled: vi.fn(),
  isAccountDeletionEnabled: () => false,
}));

const useIsMobileMock = vi.mocked(useIsMobile);
const isProjectCardEnabledMock = vi.mocked(isProjectCardEnabled);
const isProjectCardMobileEnabledMock = vi.mocked(isProjectCardMobileEnabled);

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
  pastFromDate: '',
  onPastFromDateChange: vi.fn(),
  pastToDate: '',
  onPastToDateChange: vi.fn(),
  pastSort: 'end_desc' as const,
  onPastSortChange: vi.fn(),
  onClearFilters: vi.fn(),
  selectedProjectId: 'p1',
  onRefreshTasks: vi.fn(),
  tasksLoading: false,
  tasksError: '',
  displayTaskRows: [] as never,
  taskScopePageSize: 100,
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
  projectMembers: [] as never,
  projectMilestones: [] as never,
  today: new Date('2026-05-08'),
  onCreateMilestoneForProject: vi.fn(),
  onEditMilestone: vi.fn(),
  onSaveProjectStatus: vi.fn(async () => true),
  customerContacts: [] as never,
  onAddCustomerContact: vi.fn(async () => true),
  onDeleteCustomerContact: vi.fn(async () => true),
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
};

describe('ProjectsMainPanel — mobile project card (M1)', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
    isProjectCardEnabledMock.mockReset();
    isProjectCardMobileEnabledMock.mockReset();
  });

  it('renders the new card layout on mobile when both flags are on', () => {
    useIsMobileMock.mockReturnValue(true);
    isProjectCardEnabledMock.mockReturnValue(true);
    isProjectCardMobileEnabledMock.mockReturnValue(true);

    render(<ProjectsMainPanel {...baseProps} />);

    // The new card surfaces specific block titles that the legacy panel
    // never renders. Hitting any of these proves we took the new path.
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('falls back to legacy panel on mobile when the mobile flag is off', () => {
    useIsMobileMock.mockReturnValue(true);
    isProjectCardEnabledMock.mockReturnValue(true);
    isProjectCardMobileEnabledMock.mockReturnValue(false);

    render(<ProjectsMainPanel {...baseProps} />);

    // Legacy panel does not surface a "Team" block heading — confirms we
    // skipped the new card path on mobile.
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer')).not.toBeInTheDocument();
  });

  it('renders all add buttons on mobile after M3/M4', () => {
    useIsMobileMock.mockReturnValue(true);
    isProjectCardEnabledMock.mockReturnValue(true);
    isProjectCardMobileEnabledMock.mockReturnValue(true);

    render(<ProjectsMainPanel {...baseProps} />);

    // M2: activity composer; M3: team add; M4: milestone + customer contact
    // adds. With M4 shipped, all four are accessible from mobile.
    expect(screen.getByLabelText('Add activity entry')).toBeInTheDocument();
    expect(screen.getByLabelText('Add team member')).toBeInTheDocument();
    expect(screen.getByLabelText('Add milestone')).toBeInTheDocument();
    // CustomerBlock is rendered only when a customer is selected. baseProps
    // points the project at customer "c1" so the block + button are visible.
    expect(screen.getByLabelText('Add customer contact')).toBeInTheDocument();
  });

  it('renders the activity composer + button on mobile (M2)', () => {
    useIsMobileMock.mockReturnValue(true);
    isProjectCardEnabledMock.mockReturnValue(true);
    isProjectCardMobileEnabledMock.mockReturnValue(true);

    render(<ProjectsMainPanel {...baseProps} />);

    expect(screen.getByLabelText('Add activity entry')).toBeInTheDocument();
  });

  it('keeps the project-status chip interactive on mobile (M2)', () => {
    useIsMobileMock.mockReturnValue(true);
    isProjectCardEnabledMock.mockReturnValue(true);
    isProjectCardMobileEnabledMock.mockReturnValue(true);

    render(<ProjectsMainPanel {...baseProps} />);

    // M2 makes the chip clickable on mobile (opens a bottom sheet). It is
    // labelled the same as on desktop and not disabled.
    const chip = screen.getByRole('button', { name: 'Edit project status: IN PROGRESS' });
    expect(chip).not.toBeDisabled();
  });
});
