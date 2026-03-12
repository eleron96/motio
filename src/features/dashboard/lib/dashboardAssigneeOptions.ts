import {
  DashboardAssigneeOption,
  DashboardGroupBy,
  DashboardWidget,
} from '@/features/dashboard/types/dashboard';

type DashboardDisabledAssigneeScope = Pick<DashboardWidget, 'groupBy' | 'includeDisabledAssignees'>;

type FilterDashboardAssigneeOptionsParams = {
  assignees: DashboardAssigneeOption[];
  includeDisabledAssignees: boolean;
  selectedAssigneeId?: string;
};

export const usesDashboardAssigneeGrouping = (groupBy?: DashboardGroupBy) => groupBy === 'assignee';

export const resolveDashboardIncludeDisabledAssignees = (
  widget: DashboardDisabledAssigneeScope,
) => (
  usesDashboardAssigneeGrouping(widget.groupBy)
    ? Boolean(widget.includeDisabledAssignees)
    : true
);

export const filterDashboardAssigneeOptions = ({
  assignees,
  includeDisabledAssignees,
  selectedAssigneeId,
}: FilterDashboardAssigneeOptionsParams) => {
  const visibleAssignees = includeDisabledAssignees
    ? assignees
    : assignees.filter((assignee) => assignee.isActive);
  const selectedAssignee = selectedAssigneeId
    ? assignees.find((assignee) => assignee.id === selectedAssigneeId)
    : null;

  if (!selectedAssignee || visibleAssignees.some((assignee) => assignee.id === selectedAssignee.id)) {
    return visibleAssignees;
  }

  return [...visibleAssignees, selectedAssignee]
    .sort((left, right) => left.name.localeCompare(right.name));
};
