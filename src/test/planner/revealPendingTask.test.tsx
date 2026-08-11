import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The bell only knows a task id, and an archived project's work is usually old
 * enough to sit outside the loaded date window. The intent is therefore parked
 * in the store and completed by the planner page once the task arrives.
 */

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: () => { throw new Error('not used'); } },
  getSupabase: () => { throw new Error('not used'); },
}));

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useRevealPendingTask } from '@/features/planner/hooks/useRevealPendingTask';
import type { Task } from '@/features/planner/types/planner';

const Probe: React.FC = () => {
  useRevealPendingTask();
  return null;
};

const task = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  title: 'Old work',
  projectId: 'old',
  assigneeIds: ['a1'],
  startDate: '2026-02-10',
  endDate: '2026-02-10',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

beforeEach(() => {
  usePlannerStore.setState({
    tasks: [],
    projects: [
      { id: 'old', name: 'Old', code: null, color: '#000', archived: true, customerId: null, ownerGroupId: null, status: null },
      { id: 'live', name: 'Live', code: null, color: '#000', archived: false, customerId: null, ownerGroupId: null, status: null },
    ],
    assignees: [{ id: 'a1', userId: 'u1', name: 'Anna', isActive: true, email: null, phone: null }],
    groupMode: 'project',
    pendingRevealTaskId: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRevealPendingTask', () => {
  it('waits for the task, then switches grouping and clears the intent', () => {
    usePlannerStore.setState({ pendingRevealTaskId: 'task-1' });
    render(<Probe />);

    // Задача ещё не приехала — ничего не трогаем, намерение живёт.
    expect(usePlannerStore.getState().groupMode).toBe('project');
    expect(usePlannerStore.getState().pendingRevealTaskId).toBe('task-1');

    act(() => {
      usePlannerStore.setState({ tasks: [task({})] });
    });

    expect(usePlannerStore.getState().groupMode).toBe('assignee');
    expect(usePlannerStore.getState().pendingRevealTaskId).toBeNull();
  });

  it('leaves grouping alone for a task of a live project', () => {
    usePlannerStore.setState({ pendingRevealTaskId: 'task-1' });
    render(<Probe />);

    act(() => {
      usePlannerStore.setState({ tasks: [task({ projectId: 'live' })] });
    });

    expect(usePlannerStore.getState().groupMode).toBe('project');
    expect(usePlannerStore.getState().pendingRevealTaskId).toBeNull();
  });

  it('gives up on a task that never arrives, so it cannot fire hours later', () => {
    vi.useFakeTimers();
    usePlannerStore.setState({ pendingRevealTaskId: 'task-1' });
    render(<Probe />);

    act(() => { vi.advanceTimersByTime(16000); });

    expect(usePlannerStore.getState().pendingRevealTaskId).toBeNull();
    expect(usePlannerStore.getState().groupMode).toBe('project');
  });
});
