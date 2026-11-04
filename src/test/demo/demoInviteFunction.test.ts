import { describe, expect, it, vi } from 'vitest';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';
import { invokeInviteFunction } from '@/infrastructure/auth/functionsGateway';
import { INVITE_ACTIONS } from '@/shared/contracts/actions';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

// The gateway goes through the same client the sandbox swaps in.
vi.mock('@/shared/lib/supabaseClient', () => ({ supabase: demoSupabaseClient }));

describe('invite function in the demo sandbox', () => {
  it('lists no sent invites instead of failing, so the members tab opens without an error', async () => {
    const result = await invokeInviteFunction<{ invites: unknown[] }>({
      action: INVITE_ACTIONS.LIST_SENT,
      pendingOnly: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.invites).toEqual([]);
  });

  it('lists no incoming invites either', async () => {
    const result = await invokeInviteFunction<{ invites: unknown[] }>({ action: INVITE_ACTIONS.LIST });
    expect(result.error).toBeUndefined();
    expect(result.data?.invites).toEqual([]);
  });

  it('still refuses anything that would act, like sending an invite', async () => {
    const result = await invokeInviteFunction({
      action: INVITE_ACTIONS.CREATE,
      workspaceId: 'workspace-1',
      email: 'anna@example.com',
      role: 'viewer',
    });
    expect(result.error).toBeTruthy();
  });
});
