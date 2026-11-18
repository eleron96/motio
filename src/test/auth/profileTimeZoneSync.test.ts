import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task reminders arrive at 09:00 on the person's own clock, so fetchProfile
// keeps profiles.time_zone equal to the time zone of the browser in use.

const { profileSingle, profileUpdate, demo } = vi.hoisted(() => ({
  profileSingle: vi.fn(),
  profileUpdate: vi.fn((_payload: Record<string, unknown>) => ({
    eq: vi.fn(async () => ({ error: null })),
  })),
  demo: { on: false },
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: profileSingle })) })),
      update: profileUpdate,
    })),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

vi.mock('@/features/demo/hooks/useIsDemo', () => ({
  isDemoRoute: () => demo.on,
  useIsDemo: () => demo.on,
}));

vi.mock('@/features/auth/lib/pendingLocale', () => ({
  getPendingLocale: () => null,
  clearPendingLocale: vi.fn(),
  setPendingLocale: vi.fn(),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: {
    getState: vi.fn().mockReturnValue({ locale: 'en', setLocale: vi.fn(), setLocaleFromProfile: vi.fn() }),
  },
}));

vi.mock('@/shared/store/accentColorStore', () => ({
  useAccentColorStore: {
    getState: vi.fn().mockReturnValue({ setAccentFromProfile: vi.fn() }),
  },
}));

const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const fetchProfileWithZone = async (timeZone: string | null) => {
  profileSingle.mockResolvedValue({
    data: {
      display_name: 'Anna',
      locale: 'en',
      avatar_url: null,
      status: 'ACTIVE',
      purge_after: null,
      preferences: {},
      // Already sent: the welcome email is not what this file is about.
      welcome_email_sent_at: '2026-01-01T00:00:00Z',
      time_zone: timeZone,
    },
    error: null,
  });
  const { useAuthStore } = await import('@/features/auth/store/authStore');
  useAuthStore.setState({ user: { id: 'u1' } as never });
  await useAuthStore.getState().fetchProfile();
};

const timeZoneWrites = () => profileUpdate.mock.calls
  .map(([payload]) => payload)
  .filter((payload) => 'time_zone' in payload);

describe('profile time zone', () => {
  beforeEach(() => {
    vi.resetModules();
    profileSingle.mockReset();
    profileUpdate.mockClear();
    demo.on = false;
  });

  it('is written when the profile has none yet', async () => {
    await fetchProfileWithZone(null);
    expect(timeZoneWrites()).toEqual([{ time_zone: BROWSER_ZONE }]);
  });

  it('follows the browser when the person is somewhere else now', async () => {
    const elsewhere = BROWSER_ZONE === 'Pacific/Kiritimati' ? 'Pacific/Niue' : 'Pacific/Kiritimati';
    await fetchProfileWithZone(elsewhere);
    expect(timeZoneWrites()).toEqual([{ time_zone: BROWSER_ZONE }]);
  });

  it('is left alone when it already matches', async () => {
    await fetchProfileWithZone(BROWSER_ZONE);
    expect(timeZoneWrites()).toEqual([]);
  });

  it('is never written from the demo sandbox', async () => {
    demo.on = true;
    await fetchProfileWithZone(null);
    expect(timeZoneWrites()).toEqual([]);
  });
});
