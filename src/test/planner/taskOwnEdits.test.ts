import { describe, expect, it } from 'vitest';
import {
  hasTaskOwnEditsToRevert,
  recordTaskOwnEdits,
  resolveTaskOwnEditsRevert,
} from '@/shared/domain/taskOwnEdits';
import type { Task } from '@/features/planner/types/planner';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Prepare the offer',
  projectId: 'project-1',
  assigneeIds: ['anna'],
  startDate: '2026-11-02',
  endDate: '2026-11-03',
  statusId: 'todo',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: 'Draft',
  repeatId: null,
  ...overrides,
});

describe('taskOwnEdits', () => {
  it('keeps the value before the first edit and the value after the last one', () => {
    const original = makeTask();
    let edits = recordTaskOwnEdits({}, original, { statusId: 'doing' });
    edits = recordTaskOwnEdits(edits, makeTask({ statusId: 'doing' }), { statusId: 'done' });

    expect(edits.statusId).toEqual({ from: 'todo', to: 'done' });
  });

  it('rolls back only our own fields, not what a teammate changed elsewhere', () => {
    const edits = recordTaskOwnEdits({}, makeTask(), { statusId: 'doing' });
    // A teammate renamed the task meanwhile; live sync brought it in.
    const live = makeTask({ statusId: 'doing', title: 'Renamed by Sergey' });

    expect(resolveTaskOwnEditsRevert(edits, live)).toEqual({ statusId: 'todo' });
  });

  it('leaves a field a teammate overwrote after us', () => {
    const edits = recordTaskOwnEdits({}, makeTask(), { statusId: 'doing' });
    const live = makeTask({ statusId: 'blocked' });

    expect(resolveTaskOwnEditsRevert(edits, live)).toEqual({});
    expect(hasTaskOwnEditsToRevert(edits, live)).toBe(false);
  });

  it('has nothing to revert once we changed a field back ourselves', () => {
    const original = makeTask();
    let edits = recordTaskOwnEdits({}, original, { assigneeIds: ['anna', 'sergey'] });
    edits = recordTaskOwnEdits(edits, makeTask({ assigneeIds: ['anna', 'sergey'] }), { assigneeIds: ['anna'] });

    expect(hasTaskOwnEditsToRevert(edits, makeTask())).toBe(false);
  });

  it('compares arrays by items and treats an empty description as none', () => {
    const edits = recordTaskOwnEdits({}, makeTask({ description: null }), { description: '' });
    expect(hasTaskOwnEditsToRevert(edits, makeTask({ description: '' }))).toBe(false);

    const tagEdits = recordTaskOwnEdits({}, makeTask(), { tagIds: ['urgent'] });
    expect(resolveTaskOwnEditsRevert(tagEdits, makeTask({ tagIds: ['urgent'] }))).toEqual({ tagIds: [] });
  });
});
