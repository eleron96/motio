import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useWorkspaceLoadRetry } from '@/features/planner/hooks/useWorkspaceLoadRetry';

describe('useWorkspaceLoadRetry', () => {
  const loadWorkspaceData = vi.fn(async () => {});

  beforeEach(() => {
    loadWorkspaceData.mockClear();
    usePlannerStore.getState().reset();
    usePlannerStore.setState({ loadWorkspaceData, loading: false });
  });

  it('retries a failed load when the network returns or the tab is shown again', () => {
    usePlannerStore.setState({ error: 'Failed to fetch' });
    renderHook(() => useWorkspaceLoadRetry('ws-1'));

    act(() => { window.dispatchEvent(new Event('online')); });
    expect(loadWorkspaceData).toHaveBeenCalledWith('ws-1');

    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(loadWorkspaceData).toHaveBeenCalledTimes(2);
  });

  it('does nothing while the load is fine', () => {
    renderHook(() => useWorkspaceLoadRetry('ws-1'));
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(loadWorkspaceData).not.toHaveBeenCalled();
  });

  it('does not stack a retry on a load already running', () => {
    usePlannerStore.setState({ error: 'Failed to fetch', loading: true });
    renderHook(() => useWorkspaceLoadRetry('ws-1'));
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(loadWorkspaceData).not.toHaveBeenCalled();
  });
});
