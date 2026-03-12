import { DashboardAssigneeOption } from '@/features/dashboard/types/dashboard';

type FilterDashboardAssigneeOptionsParams = {
  assignees: DashboardAssigneeOption[];
  includeDisabledAssignees: boolean;
  selectedAssigneeId?: string;
};

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
