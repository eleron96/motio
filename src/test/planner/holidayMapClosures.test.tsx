import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHolidayMap } from '@/features/planner/hooks/useHolidayMap';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';
import { useAuthStore } from '@/features/auth/store/authStore';

// Days off for the whole workspace (server setting workspaces.closures) count
// like public holidays wherever the holiday map is used; with the setting off
// nothing is read and the map is the public holidays alone.

const { fetchHolidays, listWorkspaceClosures } = vi.hoisted(() => ({
  fetchHolidays: vi.fn(),
  listWorkspaceClosures: vi.fn(),
}));

vi.mock('@/infrastructure/holidays/holidayApi', () => ({ fetchHolidays, readCachedHolidays: () => null }));
vi.mock('@/infrastructure/workspace/workspaceClosuresRepository', () => ({
  listWorkspaceClosures,
  createWorkspaceClosure: vi.fn(),
  updateWorkspaceClosure: vi.fn(),
  deleteWorkspaceClosure: vi.fn(),
}));

fetchHolidays.mockResolvedValue({
  productionCalendar: null,
  holidays: [
    { date: '2026-12-25', localName: 'Weihnachten', name: 'Christmas Day', global: true, counties: null },
  ],
});

const YEARS = [2026];

const renderHolidayMap = () => renderHook(() => useHolidayMap({
  years: YEARS,
  holidayCountryCode: 'DE',
  holidayRegionCode: null,
  fallbackHolidayLabel: 'Non-working day',
  holidayLabel: 'Holiday',
}));

const setClosuresSetting = (on: boolean) => act(() => {
  useInstanceSettingsStore.setState((state) => ({ values: { ...state.values, 'workspaces.closures': on } }));
});

describe('useHolidayMap with days off for the whole workspace', () => {
  beforeEach(() => {
    listWorkspaceClosures.mockReset().mockResolvedValue({
      closures: [{ id: 'c1', name: 'Winter closure', startDate: '2026-12-24', endDate: '2026-12-31' }],
    });
    useAuthStore.setState({ currentWorkspaceId: 'ws-closures' });
    setClosuresSetting(false);
  });

  it('reads nothing and shows only public holidays while the setting is off', async () => {
    const { result } = renderHolidayMap();
    await waitFor(() => expect(result.current.holidayDates.size).toBe(1));
    expect(listWorkspaceClosures).not.toHaveBeenCalled();
    expect(result.current.holidayMap).toEqual({ '2026-12-25': ['Weihnachten'] });
  });

  it('adds the closure days, a holiday inside them counted once with both names', async () => {
    setClosuresSetting(true);
    const { result } = renderHolidayMap();
    await waitFor(() => expect(result.current.holidayDates.size).toBe(8));
    expect(listWorkspaceClosures).toHaveBeenCalledWith('ws-closures');
    expect(result.current.holidayMap['2026-12-24']).toEqual(['Winter closure']);
    expect(result.current.holidayMap['2026-12-25']).toEqual(['Weihnachten', 'Winter closure']);
    expect(result.current.holidayMap['2027-01-01']).toBeUndefined();
  });
});
