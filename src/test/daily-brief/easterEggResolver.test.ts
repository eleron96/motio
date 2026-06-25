import { afterEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/supabaseClient', () => ({
  getSupabase: () => ({ rpc: rpcMock }),
}));

import { resolveEggKey } from '@/features/daily-brief/easter-eggs/useEasterEgg';

/** Mirrors `getSupabase().rpc(name).abortSignal(signal)` resolving to a result. */
const mockRpc = (result: { data: unknown; error: unknown }) => {
  rpcMock.mockReturnValue({ abortSignal: () => Promise.resolve(result) });
};

describe('resolveEggKey', () => {
  afterEach(() => rpcMock.mockReset());

  it('returns the key for a known egg assignment', async () => {
    mockRpc({ data: 'six-seven', error: null });
    await expect(resolveEggKey()).resolves.toBe('six-seven');
    expect(rpcMock).toHaveBeenCalledWith('get_my_daily_brief_egg');
  });

  it('returns null when there is no assignment', async () => {
    mockRpc({ data: null, error: null });
    await expect(resolveEggKey()).resolves.toBeNull();
  });

  it('returns null for an unknown / stale key not in the catalog', async () => {
    mockRpc({ data: 'effect-that-was-removed', error: null });
    await expect(resolveEggKey()).resolves.toBeNull();
  });

  it('returns null when the RPC reports an error', async () => {
    mockRpc({ data: null, error: { message: 'permission denied' } });
    await expect(resolveEggKey()).resolves.toBeNull();
  });

  it('returns null when the RPC rejects (timeout / network)', async () => {
    rpcMock.mockReturnValue({
      abortSignal: () => Promise.reject(new Error('aborted')),
    });
    await expect(resolveEggKey()).resolves.toBeNull();
  });
});
