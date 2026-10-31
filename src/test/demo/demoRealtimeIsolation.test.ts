import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The /demo sandbox never talks to the real backend. Two ways it used to leak
// into production Realtime ("invalid input syntax for type uuid: demo-user-…"):
// a hard-coded /app navigation that left the sandbox without a reload, and the
// inbox subscription accepting any user id.

const { channel, removeChannel } = vi.hoisted(() => {
  const subscribed = { on: vi.fn(), subscribe: vi.fn() };
  subscribed.on.mockReturnValue(subscribed);
  subscribed.subscribe.mockReturnValue(subscribed);
  return { channel: vi.fn(() => subscribed), removeChannel: vi.fn() };
});

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { channel, removeChannel, functions: { invoke: vi.fn() } },
}));

import { subscribeToInboxChanges } from '@/infrastructure/notifications/inboxRepository';

describe('inbox realtime subscription', () => {
  beforeEach(() => {
    channel.mockClear();
  });

  it('never opens a channel for a demo user id', () => {
    const unsubscribe = subscribeToInboxChanges('demo-user-39f78aef-44c5-4e2d-bedc-6cd9353b9108', () => {});
    expect(channel).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('subscribes for a real account', () => {
    subscribeToInboxChanges('39f78aef-44c5-4e2d-bedc-6cd9353b9108', () => {});
    expect(channel).toHaveBeenCalledWith('notifications-inbox-39f78aef-44c5-4e2d-bedc-6cd9353b9108');
  });
});

const listSources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe('screens the sandbox renders', () => {
  // Navigation inside these features must use useAppBasePath(): /demo/... in the
  // sandbox, /app/... in the app. (Redirects of super admins to /app/admin are
  // fine — the demo user is never one.)
  // The onboarding tour, the bell (auth/hooks) and account settings
  // (auth/components) run inside the sandbox too; a hard /app in any of them is
  // what walked demo visitors out of the sandbox.
  const roots = ['planner', 'dashboard', 'projects', 'members', 'onboarding'].map((feature) =>
    resolve(process.cwd(), 'src/features', feature),
  ).concat(
    resolve(process.cwd(), 'src/features/auth/hooks'),
    resolve(process.cwd(), 'src/features/auth/components'),
  );
  // Screens the sandbox never shows: a demo visitor has no account to restore.
  const notInSandbox = new Set(['src/features/auth/components/AccountRestoreScreen.tsx']);
  const hardAppNavigation = [
    String.raw`navigate\(\s*`,
    String.raw`<Navigate\s+to=\{?\s*`,
    String.raw`<(?:Link|NavLink)\s+[^>]*?to=\{?\s*`,
    String.raw`location\.(?:assign|replace)\(\s*`,
    String.raw`location\.href\s*=\s*`,
  ].join('|');
  const hardAppPath = new RegExp(`(?:${hardAppNavigation})${String.raw`['"\x60]\/app(?!\/admin)`}`);

  it('do not navigate to a hard-coded /app path', () => {
    const offenders = roots
      .flatMap(listSources)
      .map((file) => file.slice(process.cwd().length + 1))
      .filter((file) => !notInSandbox.has(file))
      .filter((file) => hardAppPath.test(readFileSync(resolve(process.cwd(), file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
