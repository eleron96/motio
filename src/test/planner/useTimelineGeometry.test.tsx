import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { readTimelineDensity, mobile } = vi.hoisted(() => ({
  readTimelineDensity: vi.fn(),
  mobile: { value: false },
}));
vi.mock('@/infrastructure/workspace/timelineDensityRepository', () => ({
  readTimelineDensity,
  writeTimelineDensity: vi.fn(async () => ({})),
}));
vi.mock('@/shared/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));

import { useTimelineGeometry } from '@/features/planner/hooks/useTimelineGeometry';
import { NORMAL_TIMELINE_GEOMETRY, TIMELINE_GEOMETRY } from '@/features/planner/lib/timelineDensity';
import { useTimelineDensityStore } from '@/features/planner/store/timelineDensityStore';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';
import { useAuthStore } from '@/features/auth/store/authStore';

const setDensitySetting = (on: boolean) => act(() => {
  useInstanceSettingsStore.setState((state) => ({ values: { ...state.values, 'timeline.density': on } }));
});

describe('useTimelineGeometry', () => {
  beforeEach(() => {
    mobile.value = false;
    readTimelineDensity.mockReset().mockResolvedValue({ density: 'compact' });
    useTimelineDensityStore.setState({ byWorkspace: {}, loaded: {} });
    useAuthStore.setState({ currentWorkspaceId: 'ws-density' });
    setDensitySetting(false);
  });

  it('is the usual timeline, without a request, while the setting is off', () => {
    const { result } = renderHook(() => useTimelineGeometry());
    expect(result.current).toBe(NORMAL_TIMELINE_GEOMETRY);
    expect(readTimelineDensity).not.toHaveBeenCalled();
  });

  it('follows the workspace choice when the setting is on', async () => {
    setDensitySetting(true);
    const { result } = renderHook(() => useTimelineGeometry());
    await waitFor(() => expect(result.current).toBe(TIMELINE_GEOMETRY.compact));
    expect(readTimelineDensity).toHaveBeenCalledWith('ws-density');
  });

  it('keeps phones on the usual layout', async () => {
    mobile.value = true;
    setDensitySetting(true);
    const { result } = renderHook(() => useTimelineGeometry());
    await waitFor(() => expect(readTimelineDensity).toHaveBeenCalled());
    expect(result.current).toBe(NORMAL_TIMELINE_GEOMETRY);
  });
});
