import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpcMock = vi.hoisted(() =>
  vi.fn(() => ({
    abortSignal: () => Promise.resolve({ data: 'six-seven', error: null }),
  })),
);
const authState = vi.hoisted(() => ({ userId: 'user-1' as string | undefined }));

vi.mock('@/shared/lib/supabaseClient', () => ({
  getSupabase: () => ({ rpc: rpcMock }),
}));
vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: authState.userId ? { id: authState.userId } : null }),
}));

import { useEasterEgg } from '@/features/daily-brief/easter-eggs/useEasterEgg';

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('useEasterEgg', () => {
  afterEach(() => {
    rpcMock.mockClear();
    authState.userId = 'user-1';
  });

  it('does not call the RPC while the brief is closed (active=false)', async () => {
    const { result } = renderHook(() => useEasterEgg(false), { wrapper: makeWrapper() });
    await Promise.resolve();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('does not call the RPC when there is no signed-in user', async () => {
    authState.userId = undefined;
    const { result } = renderHook(() => useEasterEgg(true), { wrapper: makeWrapper() });
    await Promise.resolve();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('resolves the egg component when open and assigned', async () => {
    const { result } = renderHook(() => useEasterEgg(true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(rpcMock).toHaveBeenCalledWith('get_my_daily_brief_egg');
  });
});
