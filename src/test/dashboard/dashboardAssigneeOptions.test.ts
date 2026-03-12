import { describe, expect, it } from 'vitest';
import {
  filterDashboardAssigneeOptions,
  resolveDashboardIncludeDisabledAssignees,
  usesDashboardAssigneeGrouping,
} from '@/features/dashboard/lib/dashboardAssigneeOptions';

describe('filterDashboardAssigneeOptions', () => {
  const assignees = [
    { id: 'active-1', name: 'Active User', isActive: true },
    { id: 'disabled-1', name: 'Disabled User', isActive: false },
  ];

  it('hides disabled assignees by default', () => {
    expect(filterDashboardAssigneeOptions({
      assignees,
      includeDisabledAssignees: false,
    })).toEqual([
      { id: 'active-1', name: 'Active User', isActive: true },
    ]);
  });

  it('keeps the selected disabled assignee visible while editing a saved rule', () => {
    expect(filterDashboardAssigneeOptions({
      assignees,
      includeDisabledAssignees: false,
      selectedAssigneeId: 'disabled-1',
    })).toEqual([
      { id: 'active-1', name: 'Active User', isActive: true },
      { id: 'disabled-1', name: 'Disabled User', isActive: false },
    ]);
  });

  it('returns all assignees when disabled users are explicitly included', () => {
    expect(filterDashboardAssigneeOptions({
      assignees,
      includeDisabledAssignees: true,
    })).toEqual(assignees);
  });

  it('treats only By user widgets as assignee grouping widgets', () => {
    expect(usesDashboardAssigneeGrouping('assignee')).toBe(true);
    expect(usesDashboardAssigneeGrouping('project')).toBe(false);
    expect(usesDashboardAssigneeGrouping('none')).toBe(false);
  });

  it('includes disabled users by default outside By user grouping', () => {
    expect(resolveDashboardIncludeDisabledAssignees({
      groupBy: 'project',
      includeDisabledAssignees: false,
    })).toBe(true);

    expect(resolveDashboardIncludeDisabledAssignees({
      groupBy: 'assignee',
      includeDisabledAssignees: false,
    })).toBe(false);
  });
});
