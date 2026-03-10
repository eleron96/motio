import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemberTasksPanel } from '@/features/members/components/MemberTasksPanel';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

describe('MemberTasksPanel mobile', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('renders member task cards instead of a table on mobile', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <MemberTasksPanel
        selectedAssignee={{ id: 'a1', name: 'Ivan Petrov', isActive: true } as never}
        taskScope="current"
        onChangeTaskScope={vi.fn()}
        memberTaskCountsDate="2026-03-07"
        search=""
        onSearchChange={vi.fn()}
        statusFilterLabel="All statuses"
        setStatusPreset={vi.fn()}
        statuses={[{ id: 's1', name: 'Done', emoji: null } as never]}
        statusFilterIds={[]}
        onToggleStatus={vi.fn()}
        projectFilterLabel="All projects"
        projectOptions={[{ id: 'p1', name: 'Website redesign', code: 'WEB', color: '#3b82f6', archived: false } as never]}
        projectFilterIds={[]}
        onToggleProject={vi.fn()}
        pastFromDate=""
        onPastFromDateChange={vi.fn()}
        pastToDate=""
        onPastToDateChange={vi.fn()}
        pastSort="end_desc"
        onPastSortChange={vi.fn()}
        onClearFilters={vi.fn()}
        onRefresh={vi.fn()}
        selectedAssigneeId="a1"
        tasksLoading={false}
        selectedCount={0}
        onDeleteSelected={vi.fn()}
        tasksError=""
        displayTaskRows={[
          {
            key: 'task-1',
            task: {
              id: 'task-1',
              title: 'Prepare project brief',
              statusId: 's1',
              projectId: 'p1',
              startDate: '2026-03-10',
              endDate: '2026-03-11',
            } as never,
            taskIds: ['task-1'],
            repeatMeta: null,
          },
        ]}
        allVisibleSelected={false}
        someVisibleSelected={false}
        onToggleAll={vi.fn()}
        statusById={new Map([['s1', { id: 's1', name: 'Done', emoji: null } as never]])}
        projectById={new Map([['p1', { id: 'p1', name: 'Website redesign', code: 'WEB', color: '#3b82f6', archived: false } as never]])}
        selectedTaskIds={new Set<string>()}
        onSelectTask={vi.fn()}
        onToggleTask={vi.fn()}
        taskScopePageSize={100}
        displayTotalCount={1}
        pageIndex={1}
        totalPages={1}
        onPrevPage={vi.fn()}
        onNextPage={vi.fn()}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: 'Task' })).not.toBeInTheDocument();
    expect(screen.getByText('Prepare project brief')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('[WEB] Website redesign')).toBeInTheDocument();
    expect(screen.getByText('10 Mar 2026 – 11 Mar 2026')).toBeInTheDocument();
  });
});
