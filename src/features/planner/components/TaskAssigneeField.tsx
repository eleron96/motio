import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { getPersonMonogram } from '@/shared/domain/personName';
import { MobileAssigneeField } from '@/features/planner/components/MobileAssigneeField';
import type { Assignee } from '@/features/planner/types/planner';

interface TaskAssigneeFieldProps {
  /** Every assignee of the workspace, in their canonical order. */
  assignees: Assignee[];
  /** The same people minus the hidden admin. */
  filteredAssignees: Assignee[];
  pickedAssigneeIds: string[];
  setPickedAssigneeIds: (ids: string[]) => void;
  canEdit: boolean;
  isMobile: boolean;
}

/**
 * Who works on the open task. Disabled people can be unpicked but not picked
 * again; the selection is kept in the workspace's order of people.
 */
export const TaskAssigneeField: React.FC<TaskAssigneeFieldProps> = ({
  assignees,
  filteredAssignees,
  pickedAssigneeIds,
  setPickedAssigneeIds,
  canEdit,
  isMobile,
}) => {
  const isReadOnly = !canEdit;
  const selectableAssignees = useMemo(() => (
    filteredAssignees.filter(
      (assignee) => assignee.isActive || pickedAssigneeIds.includes(assignee.id),
    )
  ), [filteredAssignees, pickedAssigneeIds]);

  const assigneeLabel = useMemo(() => {
    if (pickedAssigneeIds.length === 0) return t`Unassigned`;
    const selected = filteredAssignees
      .filter((assignee) => pickedAssigneeIds.includes(assignee.id))
      .map((assignee) => assignee.name);
    if (selected.length === 1 && pickedAssigneeIds.length === 1) return selected[0];
    return t`${pickedAssigneeIds.length} assignees`;
  }, [filteredAssignees, pickedAssigneeIds]);

  const sortByWorkspaceOrder = (ids: string[]) => {
    const order = new Map(assignees.map((assignee, index) => [assignee.id, index]));
    return [...new Set(ids)].sort((left, right) => (
      (order.get(left) ?? 0) - (order.get(right) ?? 0)
    ));
  };

  /**
   * The mobile picker hands back the whole selection rather than one toggle, so
   * it goes through the same guards (read-only, disabled people) and the same
   * canonical ordering as toggling one by one.
   */
  const handleAssigneesChange = (nextIds: string[]) => {
    if (!canEdit) return;
    const allowed = nextIds.filter((id) => {
      const assignee = assignees.find((candidate) => candidate.id === id);
      if (!assignee) return false;
      return assignee.isActive || pickedAssigneeIds.includes(id);
    });
    setPickedAssigneeIds(sortByWorkspaceOrder(allowed));
  };

  const handleAssigneeToggle = (assigneeId: string) => {
    if (!canEdit) return;
    const targetAssignee = assignees.find((assignee) => assignee.id === assigneeId);
    if (targetAssignee && !targetAssignee.isActive && !pickedAssigneeIds.includes(assigneeId)) {
      return;
    }
    const next = pickedAssigneeIds.includes(assigneeId)
      ? pickedAssigneeIds.filter((id) => id !== assigneeId)
      : [...pickedAssigneeIds, assigneeId];
    setPickedAssigneeIds(sortByWorkspaceOrder(next));
  };

  if (isMobile) {
    return (
      <MobileAssigneeField
        label={assigneeLabel}
        assignees={selectableAssignees}
        selectedIds={pickedAssigneeIds}
        disabled={isReadOnly}
        onChange={handleAssigneesChange}
        emptyLabel={t`No assignees available.`}
      />
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between bg-background font-normal"
          disabled={isReadOnly}
        >
          <span className="truncate">{assigneeLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {selectableAssignees.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t`No assignees available.`}</div>
        ) : (
          <div
            className="max-h-48 overflow-y-auto overscroll-contain pr-2"
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              {selectableAssignees.map((assignee) => {
                const isAssigned = pickedAssigneeIds.includes(assignee.id);
                const isDisabled = isReadOnly || (!assignee.isActive && !isAssigned);
                return (
                  <label key={assignee.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <Checkbox
                      checked={isAssigned}
                      onCheckedChange={() => handleAssigneeToggle(assignee.id)}
                      disabled={isDisabled}
                    />
                    <PersonAvatar
                      assigneeId={assignee.id}
                      userId={assignee.userId}
                      avatarUrl={assignee.avatar}
                      initials={getPersonMonogram(assignee.name, 'U')}
                      colorSeed={assignee.userId ?? assignee.id}
                      size="xs"
                    />
                    <span className="text-sm truncate">
                      {assignee.name}
                      {!assignee.isActive && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({t`disabled`})</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
