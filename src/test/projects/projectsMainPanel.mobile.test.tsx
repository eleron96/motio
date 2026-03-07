import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ProjectsMainPanel mobile', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('renders task cards instead of a table on mobile', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <ProjectsMainPanel
        mode="projects"
        selectedProject={{ id: 'p1', name: 'Website redesign', code: 'WEB', color: '#3b82f6', customerId: 'c1', archived: false } as never}
        customerById={new Map([['c1', { id: 'c1', name: 'Acme' } as never]])}
        search=""
        onSearchChange={vi.fn()}
        statusFilterLabel="All statuses"
        setStatusPreset={vi.fn()}
        statuses={[{ id: 's1', name: 'In progress', emoji: null } as never]}
        statusFilterIds={[]}
        onToggleStatus={vi.fn()}
        assigneeFilterLabel="All assignees"
        assigneeOptions={[{ id: 'a1', name: 'Alexandra Robertson', isActive: true } as never]}
        assigneeFilterIds={[]}
        onToggleAssignee={vi.fn()}
        onClearFilters={vi.fn()}
        selectedProjectId="p1"
        onRefreshTasks={vi.fn()}
        tasksLoading={false}
        tasksError=""
        displayTaskRows={[
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
        ]}
        statusById={new Map([['s1', { id: 's1', name: 'In progress', emoji: null } as never]])}
        assigneeById={new Map([['a1', { id: 'a1', name: 'Alexandra Robertson', isActive: true } as never]])}
        onSelectTask={vi.fn()}
        selectedMilestone={null}
        selectedMilestoneProject={null}
        selectedMilestoneCustomer={null}
        formatMilestoneDate={vi.fn()}
        trackedProjectIdSet={new Set<string>()}
        onOpenProjectFromMilestone={vi.fn()}
        onOpenMilestoneSettings={vi.fn()}
        onRequestDeleteMilestone={vi.fn()}
        canEdit
        selectedCustomer={null}
        selectedCustomerProjects={[]}
        customersCount={1}
        onOpenProjectFromCustomer={vi.fn()}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: 'Task' })).not.toBeInTheDocument();
    expect(screen.getByText('Plan launch communication')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Alexandra Robertson')).toBeInTheDocument();
    expect(screen.getByText('10 Mar 2026 – 12 Mar 2026')).toBeInTheDocument();
  });
});
