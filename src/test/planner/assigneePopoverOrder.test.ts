import { describe, expect, it } from 'vitest';
import type { Assignee } from '@/features/planner/types/planner';
import { orderAssigneesForPopover } from '@/features/planner/lib/assigneePopoverOrder';

const makeAssignee = (id: string, name: string): Assignee => ({
  id,
  name,
  isActive: true,
});

describe('assigneePopoverOrder', () => {
  it('keeps selected assignees first when popover is closed', () => {
    const assignees = [
      makeAssignee('a1', 'Anna'),
      makeAssignee('a2', 'Boris'),
      makeAssignee('a3', 'Chris'),
    ];

    const ordered = orderAssigneesForPopover({
      assignees,
      selectedAssigneeIds: ['a3'],
      frozenOrderIds: null,
    });

    expect(ordered.map((assignee) => assignee.id)).toEqual(['a3', 'a1', 'a2']);
  });

  it('preserves frozen order while popover is open even when selection changes', () => {
    const assignees = [
      makeAssignee('a1', 'Anna'),
      makeAssignee('a2', 'Boris'),
      makeAssignee('a3', 'Chris'),
    ];

    const ordered = orderAssigneesForPopover({
      assignees,
      selectedAssigneeIds: ['a3'],
      frozenOrderIds: ['a1', 'a2', 'a3'],
    });

    expect(ordered.map((assignee) => assignee.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('appends new assignees not present in frozen order', () => {
    const assignees = [
      makeAssignee('a1', 'Anna'),
      makeAssignee('a3', 'Chris'),
      makeAssignee('a4', 'Diana'),
    ];

    const ordered = orderAssigneesForPopover({
      assignees,
      selectedAssigneeIds: ['a3', 'a4'],
      frozenOrderIds: ['a1', 'a2', 'a3'],
    });

    expect(ordered.map((assignee) => assignee.id)).toEqual(['a1', 'a3', 'a4']);
  });
});

