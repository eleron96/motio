import { describe, expect, it } from 'vitest';
import { classifyUsageDevice, usageSnapshotKey, type UsageSnapshot } from '@/shared/domain/usageDevice';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  unknown: 'SomeBrowser/1.0',
};

const desktopSignals = { maxTouchPoints: 0, coarsePointer: false, shortSide: 900 };

describe('classifyUsageDevice', () => {
  it('recognises phones', () => {
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.iphone })).toEqual({ device: 'phone', os: 'ios' });
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.androidPhone })).toEqual({ device: 'phone', os: 'android' });
  });

  it('recognises tablets, including an iPad that reports itself as a Mac', () => {
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.ipadOld })).toEqual({ device: 'tablet', os: 'ios' });
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.androidTablet })).toEqual({ device: 'tablet', os: 'android' });
    expect(classifyUsageDevice({ userAgent: UA.macSafari, maxTouchPoints: 5, coarsePointer: true, shortSide: 820 }))
      .toEqual({ device: 'tablet', os: 'ios' });
  });

  it('treats computers as desktop with their OS', () => {
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.macSafari })).toEqual({ device: 'desktop', os: 'macos' });
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.windows })).toEqual({ device: 'desktop', os: 'windows' });
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.linux })).toEqual({ device: 'desktop', os: 'linux' });
  });

  it('keeps a touchscreen laptop a desktop', () => {
    expect(classifyUsageDevice({ userAgent: UA.windows, maxTouchPoints: 10, coarsePointer: true, shortSide: 400 }))
      .toEqual({ device: 'desktop', os: 'windows' });
  });

  it('sizes an unknown touch device by its short side', () => {
    const touch = { userAgent: UA.unknown, maxTouchPoints: 5, coarsePointer: true };
    expect(classifyUsageDevice({ ...touch, shortSide: 390 })).toEqual({ device: 'phone', os: 'other' });
    expect(classifyUsageDevice({ ...touch, shortSide: 768 })).toEqual({ device: 'tablet', os: 'other' });
    expect(classifyUsageDevice({ ...desktopSignals, userAgent: UA.unknown })).toEqual({ device: 'desktop', os: 'other' });
  });
});

describe('usageSnapshotKey', () => {
  const snapshot: UsageSnapshot = {
    device: 'phone', os: 'ios', standalone: true, viewMode: 'day', plannerSurface: 'timeline', groupMode: 'assignee',
  };

  it('changes when the day or any field changes, not otherwise', () => {
    const key = usageSnapshotKey(snapshot, '2026-10-27');
    expect(usageSnapshotKey({ ...snapshot }, '2026-10-27')).toBe(key);
    expect(usageSnapshotKey(snapshot, '2026-10-28')).not.toBe(key);
    expect(usageSnapshotKey({ ...snapshot, viewMode: 'calendar' }, '2026-10-27')).not.toBe(key);
    expect(usageSnapshotKey({ ...snapshot, standalone: false }, '2026-10-27')).not.toBe(key);
  });
});
