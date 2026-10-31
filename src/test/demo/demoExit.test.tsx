import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Leaving the sandbox without a page load must never run the real app as the
// fake demo user (prod logged "demo-user-…" ids and anon calls from /app).

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}));

import { DemoExitGuard } from '@/features/demo/components/DemoExitGuard';
import { isDemoUserId } from '@/features/demo/lib/demoIdentity';

const replace = vi.fn();
const originalLocation = window.location;

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <DemoExitGuard />
  </MemoryRouter>,
);

describe('DemoExitGuard', () => {
  beforeEach(() => {
    replace.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('reloads the page when the demo user turns up outside /demo', () => {
    auth.user = { id: 'demo-user-0f350da0-9849-4129-a270-31ce6e22ecfc' };
    renderAt('/app/dashboard?tab=heatmap');
    expect(replace).toHaveBeenCalledWith('/app/dashboard?tab=heatmap');
  });

  it('leaves the sandbox itself and real accounts alone', () => {
    auth.user = { id: 'demo-user-0f350da0-9849-4129-a270-31ce6e22ecfc' };
    renderAt('/demo/dashboard');
    auth.user = { id: '3853a2b3-3212-474f-9cc2-ee8ff5a73e68' };
    renderAt('/app');
    auth.user = null;
    renderAt('/auth');
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('isDemoUserId', () => {
  it('tells the sandbox user from real account ids', () => {
    expect(isDemoUserId('demo-user-abc')).toBe(true);
    expect(isDemoUserId('3853a2b3-3212-474f-9cc2-ee8ff5a73e68')).toBe(false);
    expect(isDemoUserId(null)).toBe(false);
  });
});

describe('a page that started in the sandbox', () => {
  it('keeps talking to the demo mock after a route change out of /demo', async () => {
    const previous = window.location.pathname;
    window.history.pushState({}, '', '/demo');
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ kind: 'prod' }) }));
    const { getSupabase } = await import('@/shared/lib/supabaseClient');
    const { demoSupabaseClient } = await import('@/features/demo/lib/demoSupabaseClient');

    window.history.pushState({}, '', '/app/dashboard');
    expect(getSupabase()).toBe(demoSupabaseClient);

    window.history.pushState({}, '', previous);
  });

  it('a page that started in the real app uses the real client outside /demo', async () => {
    window.history.pushState({}, '', '/app');
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ kind: 'prod' }) }));
    const { getSupabase } = await import('@/shared/lib/supabaseClient');
    const { demoSupabaseClient } = await import('@/features/demo/lib/demoSupabaseClient');

    expect(getSupabase()).not.toBe(demoSupabaseClient);
    window.history.pushState({}, '', '/demo');
    expect(getSupabase()).toBe(demoSupabaseClient);
    window.history.pushState({}, '', '/');
  });
});
