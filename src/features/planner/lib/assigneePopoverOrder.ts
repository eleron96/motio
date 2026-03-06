import type { Assignee } from '@/features/planner/types/planner';

type OrderAssigneesForPopoverOptions = {
  assignees: Assignee[];
  selectedAssigneeIds: string[];
  frozenOrderIds: string[] | null;
};

const applyFrozenOrder = (assignees: Assignee[], frozenOrderIds: string[]) => {
  const byId = new Map(assignees.map((assignee) => [assignee.id, assignee]));
  const usedIds = new Set<string>();
  const ordered: Assignee[] = [];

  for (const assigneeId of frozenOrderIds) {
    const assignee = byId.get(assigneeId);
    if (!assignee) continue;
    ordered.push(assignee);
    usedIds.add(assigneeId);
  }

  for (const assignee of assignees) {
    if (usedIds.has(assignee.id)) continue;
    ordered.push(assignee);
  }

  return ordered;
};

export const orderAssigneesForPopover = ({
  assignees,
  selectedAssigneeIds,
  frozenOrderIds,
}: OrderAssigneesForPopoverOptions) => {
  if (assignees.length === 0) return assignees;

  if (frozenOrderIds && frozenOrderIds.length > 0) {
    return applyFrozenOrder(assignees, frozenOrderIds);
  }

  if (selectedAssigneeIds.length === 0) return assignees;
  const selectedIds = new Set(selectedAssigneeIds);
  const selected: Assignee[] = [];
  const unselected: Assignee[] = [];

  for (const assignee of assignees) {
    if (selectedIds.has(assignee.id)) {
      selected.push(assignee);
      continue;
    }
    unselected.push(assignee);
  }

  return [...selected, ...unselected];
};

