import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GroupMode, PlannerSurface, ViewMode } from '@/features/planner/types/planner';
import type { UsageSnapshot } from '@/shared/domain/usageDevice';

const recordUsageDay = vi.fn(async (_snapshot: UsageSnapshot): Promise<{ error?: string }> => ({}));
vi.mock('@/infrastructure/usage/usageRepository', () => ({
  recordUsageDay: (snapshot: UsageSnapshot) => recordUsageDay(snapshot),
}));

let demo = false;
vi.mock('@/features/demo/hooks/useIsDemo', () => ({ isDemoRoute: () => demo }));

import { useUsageBeacon } from '@/features/planner/hooks/useUsageBeacon';

type Props = { enabled: boolean; viewMode: ViewMode; plannerSurface: PlannerSurface; groupMode: GroupMode };
const base: Props = { enabled: true, viewMode: 'day', plannerSurface: 'timeline', groupMode: 'assignee' };

const flush = async (ms = 3000) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};

describe('useUsageBeacon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    recordUsageDay.mockClear();
    demo = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one snapshot once the view settles', async () => {
    renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush(2999);
    expect(recordUsageDay).not.toHaveBeenCalled();
    await flush(1);
    expect(recordUsageDay).toHaveBeenCalledTimes(1);
    expect(recordUsageDay.mock.calls[0][0]).toMatchObject({
      viewMode: 'day', plannerSurface: 'timeline', groupMode: 'assignee', standalone: false,
    });
  });

  it('collapses quick mode flips into the last one', async () => {
    const { rerender } = renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush(1000);
    rerender({ ...base, viewMode: 'week' });
    await flush(1000);
    rerender({ ...base, viewMode: 'calendar' });
    await flush();
    expect(recordUsageDay).toHaveBeenCalledTimes(1);
    expect(recordUsageDay.mock.calls[0][0]).toMatchObject({ viewMode: 'calendar' });
  });

  it('does not resend the same snapshot, even after a reload', async () => {
    const first = renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush();
    first.unmount();
    renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush();
    expect(recordUsageDay).toHaveBeenCalledTimes(1);
  });

  it('sends again when the view changes', async () => {
    const { rerender } = renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush();
    rerender({ ...base, plannerSurface: 'board', groupMode: 'project' });
    await flush();
    expect(recordUsageDay).toHaveBeenCalledTimes(2);
    expect(recordUsageDay.mock.calls[1][0]).toMatchObject({ plannerSurface: 'board', groupMode: 'project' });
  });

  it('retries a failed send next time instead of remembering it', async () => {
    recordUsageDay.mockResolvedValueOnce({ error: 'network' });
    const first = renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush();
    first.unmount();
    renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush();
    expect(recordUsageDay).toHaveBeenCalledTimes(2);
  });

  it('stays silent when signed out or in the demo', async () => {
    renderHook((props: Props) => useUsageBeacon(props), { initialProps: { ...base, enabled: false } });
    await flush();
    demo = true;
    renderHook((props: Props) => useUsageBeacon(props), { initialProps: base });
    await flush();
    expect(recordUsageDay).not.toHaveBeenCalled();
  });
});
