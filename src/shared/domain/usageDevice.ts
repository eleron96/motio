// Coarse device facts for the daily usage snapshot (see migration 0154): which
// kind of device and OS, nothing that identifies the person or the browser.

export type UsageDevice = 'phone' | 'tablet' | 'desktop';
export type UsageOs = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'other';

export interface DeviceSignals {
  userAgent: string;
  /** navigator.maxTouchPoints — tells an iPad (which reports "Macintosh") from a Mac. */
  maxTouchPoints: number;
  /** matchMedia('(pointer: coarse)') — touch as the primary input. */
  coarsePointer: boolean;
  /** Smaller screen side in CSS pixels, so rotating a phone does not make it a tablet. */
  shortSide: number;
}

export interface UsageSnapshot {
  device: UsageDevice;
  os: UsageOs;
  standalone: boolean;
  viewMode: 'day' | 'week' | 'calendar';
  plannerSurface: 'timeline' | 'board';
  groupMode: 'assignee' | 'project';
}

// Phones are narrower than this on their short side; tablets are wider.
const PHONE_MAX_SHORT_SIDE = 600;

export const classifyUsageDevice = (signals: DeviceSignals): { device: UsageDevice; os: UsageOs } => {
  const ua = signals.userAgent.toLowerCase();
  const touchMac = ua.includes('macintosh') && signals.maxTouchPoints > 1;

  if (/iphone|ipod/.test(ua)) return { device: 'phone', os: 'ios' };
  if (ua.includes('ipad') || touchMac) return { device: 'tablet', os: 'ios' };
  if (ua.includes('android')) {
    return { device: ua.includes('mobile') ? 'phone' : 'tablet', os: 'android' };
  }

  const os: UsageOs = ua.includes('windows')
    ? 'windows'
    : ua.includes('macintosh') || ua.includes('mac os x')
      ? 'macos'
      : ua.includes('linux') || ua.includes('cros')
        ? 'linux'
        : 'other';

  // Unknown touch-first device: decide by screen size rather than call it a desktop.
  if (signals.coarsePointer && os === 'other') {
    return { device: signals.shortSide <= PHONE_MAX_SHORT_SIDE ? 'phone' : 'tablet', os };
  }
  return { device: 'desktop', os };
};

// Same snapshot on the same day = nothing new to send.
export const usageSnapshotKey = (snapshot: UsageSnapshot, dayKey: string): string => [
  dayKey,
  snapshot.device,
  snapshot.os,
  snapshot.standalone ? 'app' : 'web',
  snapshot.viewMode,
  snapshot.plannerSurface,
  snapshot.groupMode,
].join('|');
