import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskAttribution } from '@/infrastructure/tasks/taskAttributionRepository';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), isDemo: false }));
vi.mock('@/infrastructure/tasks/taskAttributionRepository', () => ({ fetchTaskAttribution: mocks.fetch }));
vi.mock('@/features/demo/hooks/useIsDemo', () => ({ useIsDemo: () => mocks.isDemo }));

import { useTaskAttribution } from '@/features/planner/hooks/useTaskAttribution';

const unknown = { createdByName: null, updatedByName: null };
const attribution = { createdByName: 'Anna', updatedByName: 'Max' };
type Props = { taskId: string | null; updatedAt?: string };

const deferred = () => {
  let resolve!: (value: TaskAttribution) => void;
  const promise = new Promise<TaskAttribution>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('useTaskAttribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemo = false;
    mocks.fetch.mockResolvedValue(attribution);
  });
  afterEach(cleanup);

  it('loads only an open task and refreshes after its confirmed version changes', async () => {
    const { result, rerender } = renderHook(
      ({ taskId, updatedAt }: Props) => useTaskAttribution(taskId, updatedAt),
      { initialProps: { taskId: null } as Props },
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual(unknown);

    rerender({ taskId: 'task-1', updatedAt: 'version-1' });
    expect(result.current).toEqual(unknown);
    await waitFor(() => expect(result.current).toEqual(attribution));
    expect(mocks.fetch).toHaveBeenCalledWith('task-1', 'version-1');

    rerender({ taskId: 'task-1', updatedAt: 'version-1' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    mocks.fetch.mockResolvedValue({ ...attribution, updatedByName: 'Olga' });
    rerender({ taskId: 'task-1', updatedAt: 'version-2' });
    expect(result.current).toEqual(unknown);
    await waitFor(() => expect(result.current.updatedByName).toBe('Olga'));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not show an earlier task response after switching cards', async () => {
    const first = deferred();
    const second = deferred();
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ taskId, updatedAt }: Props) => useTaskAttribution(taskId, updatedAt),
      { initialProps: { taskId: 'task-1', updatedAt: 'version-1' } as Props },
    );
    rerender({ taskId: 'task-2', updatedAt: 'version-2' });
    await act(async () => { second.resolve({ createdByName: 'Olga', updatedByName: null }); });
    await act(async () => { first.resolve(attribution); });
    expect(result.current).toEqual({ createdByName: 'Olga', updatedByName: null });
  });

  it('ignores an older response for the same task version and hides names on closing', async () => {
    const first = deferred();
    const second = deferred();
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ taskId, updatedAt }: Props) => useTaskAttribution(taskId, updatedAt),
      { initialProps: { taskId: 'task-1', updatedAt: 'version-1' } as Props },
    );
    rerender({ taskId: 'task-1', updatedAt: 'version-2' });
    await act(async () => { second.resolve({ ...attribution, updatedByName: 'Olga' }); });
    await act(async () => { first.resolve(attribution); });
    expect(result.current.updatedByName).toBe('Olga');
    rerender({ taskId: null });
    expect(result.current).toEqual(unknown);
  });

  it('leaves attribution empty when loading fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('Offline'));
    const { result } = renderHook(() => useTaskAttribution('task-1', 'version-1'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual(unknown);
  });

  it('does not fetch author names in the demo', () => {
    mocks.isDemo = true;
    const { result } = renderHook(() => useTaskAttribution('demo-task-1'));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual(unknown);
  });
});
