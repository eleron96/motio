import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTaskDrafts } from '@/features/planner/hooks/useTaskDrafts';
import type { Task } from '@/features/planner/types/planner';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Original title',
  projectId: 'project-1',
  assigneeIds: [],
  startDate: '2026-02-01',
  endDate: '2026-02-01',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: 'Original description',
  repeatId: null,
  ...overrides,
});

describe('useTaskDrafts', () => {
  it('seeds drafts from the selected task', () => {
    const task = makeTask();
    const { result } = renderHook(() => useTaskDrafts({ task, selectedTaskId: task.id }));
    expect(result.current.draftTitle).toBe('Original title');
    expect(result.current.draftDescription).toBe('Original description');
  });

  it('re-seeds drafts when the selected task changes', () => {
    const taskA = makeTask({ id: 'a', title: 'A title', description: 'A desc' });
    const taskB = makeTask({ id: 'b', title: 'B title', description: 'B desc' });
    const { result, rerender } = renderHook(
      ({ task, selectedTaskId }: { task: Task; selectedTaskId: string }) =>
        useTaskDrafts({ task, selectedTaskId }),
      { initialProps: { task: taskA, selectedTaskId: taskA.id } },
    );
    expect(result.current.draftTitle).toBe('A title');

    rerender({ task: taskB, selectedTaskId: taskB.id });
    expect(result.current.draftTitle).toBe('B title');
    expect(result.current.draftDescription).toBe('B desc');
  });

  it('keeps an in-progress title edit when live-sync replaces the same task object', () => {
    const task = makeTask({ title: 'Original title' });
    const { result, rerender } = renderHook(
      ({ task, selectedTaskId }: { task: Task; selectedTaskId: string }) =>
        useTaskDrafts({ task, selectedTaskId }),
      { initialProps: { task, selectedTaskId: task.id } },
    );

    // User types — mirrors the panel's onChange (updates both ref and state).
    act(() => {
      result.current.titleDraftRef.current = 'My unsaved edit';
      result.current.setDraftTitle('My unsaved edit');
    });

    // Live-sync swaps the task object (same id) with an external title change.
    rerender({ task: makeTask({ title: 'Externally renamed' }), selectedTaskId: task.id });

    expect(result.current.draftTitle).toBe('My unsaved edit');
  });

  it('reflects an external title change when the draft is untouched', () => {
    const task = makeTask({ title: 'Original title' });
    const { result, rerender } = renderHook(
      ({ task, selectedTaskId }: { task: Task; selectedTaskId: string }) =>
        useTaskDrafts({ task, selectedTaskId }),
      { initialProps: { task, selectedTaskId: task.id } },
    );

    rerender({ task: makeTask({ title: 'Externally renamed' }), selectedTaskId: task.id });

    expect(result.current.draftTitle).toBe('Externally renamed');
  });

  it('backfills a lazy-loaded description (undefined -> defined)', () => {
    const loading = makeTask({ description: undefined });
    const { result, rerender } = renderHook(
      ({ task, selectedTaskId }: { task: Task; selectedTaskId: string }) =>
        useTaskDrafts({ task, selectedTaskId }),
      { initialProps: { task: loading, selectedTaskId: loading.id } },
    );
    expect(result.current.draftDescription).toBe('');

    rerender({ task: makeTask({ description: 'Loaded description' }), selectedTaskId: loading.id });
    expect(result.current.draftDescription).toBe('Loaded description');
  });

  it('does not clobber an in-progress description edit when the lazy load resolves', () => {
    const loading = makeTask({ description: undefined });
    const { result, rerender } = renderHook(
      ({ task, selectedTaskId }: { task: Task; selectedTaskId: string }) =>
        useTaskDrafts({ task, selectedTaskId }),
      { initialProps: { task: loading, selectedTaskId: loading.id } },
    );

    act(() => {
      result.current.descriptionDraftRef.current = 'Typed before load';
      result.current.setDraftDescription('Typed before load');
    });

    rerender({ task: makeTask({ description: 'Loaded description' }), selectedTaskId: loading.id });

    expect(result.current.draftDescription).toBe('Typed before load');
  });
});
