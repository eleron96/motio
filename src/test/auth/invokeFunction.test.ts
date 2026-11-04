import { beforeEach, describe, expect, it, vi } from 'vitest';

const { functionsInvoke, refreshSession } = vi.hoisted(() => ({
  functionsInvoke: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: functionsInvoke },
    auth: { refreshSession },
  },
}));

import { invokeFunction } from '@/shared/lib/invokeFunction';

const unauthorized = { data: null, error: { message: 'Unauthorized' }, response: new Response('{}', { status: 401 }) };
const ok = { data: { fine: true }, error: null, response: new Response('{}', { status: 200 }) };

describe('invokeFunction', () => {
  beforeEach(() => {
    functionsInvoke.mockReset();
    refreshSession.mockReset();
  });

  it('passes the body through and returns a success as is', async () => {
    functionsInvoke.mockResolvedValue(ok);

    const result = await invokeFunction('admin', { action: 'x' });

    expect(result).toBe(ok);
    expect(functionsInvoke).toHaveBeenCalledWith('admin', { body: { action: 'x' } });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('does not refresh on other errors', async () => {
    const serverError = { data: null, error: { message: 'boom' }, response: new Response('{}', { status: 500 }) };
    functionsInvoke.mockResolvedValue(serverError);

    expect(await invokeFunction('admin', {})).toBe(serverError);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  // A token from before an auth upgrade is refused by the functions while the
  // database still takes it; the refreshed token passes.
  it('refreshes the session once on 401 and calls again', async () => {
    functionsInvoke.mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(ok);
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });

    const result = await invokeFunction('invite', { action: 'y' });

    expect(result).toBe(ok);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledTimes(2);
  });

  it('returns the 401 when the session cannot be refreshed', async () => {
    functionsInvoke.mockResolvedValue(unauthorized);
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'Session not found' } });

    const result = await invokeFunction('admin', {});

    expect(result).toBe(unauthorized);
    expect(functionsInvoke).toHaveBeenCalledTimes(1);
  });
});
