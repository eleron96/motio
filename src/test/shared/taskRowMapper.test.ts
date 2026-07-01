import { describe, expect, it } from 'vitest';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';

describe('taskRowMapper', () => {
  it('normalizes assignee ids by merging legacy and array values without duplicates', () => {
    expect(normalizeAssigneeIds(['u1', 'u2', 'u1'], 'u3')).toEqual(['u1', 'u2', 'u3']);
    expect(normalizeAssigneeIds(null, 'u1')).toEqual(['u1']);
    expect(normalizeAssigneeIds([], null)).toEqual([]);
  });

  it('maps db task row into planner task shape', () => {
    const mapped = mapTaskRow({
      id: 'task-1',
      title: 'Prepare report',
      project_id: 'project-1',
      assignee_id: 'u2',
      assignee_ids: ['u1', 'u2'],
      start_date: '2026-02-01',
      end_date: '2026-02-03',
      status_id: 'status-1',
      type_id: 'type-1',
      priority: 'high',
      tag_ids: null,
      description: 'desc',
      repeat_id: null,
    });

    expect(mapped).toEqual({
      id: 'task-1',
      title: 'Prepare report',
      projectId: 'project-1',
      assigneeIds: ['u1', 'u2'],
      startDate: '2026-02-01',
      endDate: '2026-02-03',
      statusId: 'status-1',
      typeId: 'type-1',
      priority: 'high',
      tagIds: [],
      description: 'desc',
      repeatId: null,
      repeatEnds: null,
    });
  });

  it('maps a persisted repeat end mode onto the task', () => {
    const mapped = mapTaskRow({
      id: 'task-2',
      title: 'Weekly sync',
      project_id: null,
      assignee_id: null,
      assignee_ids: [],
      start_date: '2026-02-01',
      end_date: '2026-02-01',
      status_id: 'status-1',
      type_id: 'type-1',
      priority: null,
      tag_ids: [],
      description: null,
      repeat_id: 'repeat-1',
      repeat_ends: 'never',
    });

    expect(mapped.repeatEnds).toBe('never');
  });

  it('coerces an unknown repeat_ends value to null', () => {
    const mapped = mapTaskRow({
      id: 'task-3',
      title: 'Weekly sync',
      project_id: null,
      assignee_id: null,
      assignee_ids: [],
      start_date: '2026-02-01',
      end_date: '2026-02-01',
      status_id: 'status-1',
      type_id: 'type-1',
      priority: null,
      tag_ids: [],
      description: null,
      repeat_id: 'repeat-1',
      repeat_ends: 'garbage',
    });

    expect(mapped.repeatEnds).toBeNull();
  });
});
