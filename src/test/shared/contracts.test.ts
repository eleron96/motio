import { describe, expect, it } from 'vitest';
import { adminRequestSchema } from '@/shared/contracts/admin.contract';
import { inviteRequestSchema } from '@/shared/contracts/invite.contract';
import { ADMIN_ACTIONS, INVITE_ACTIONS } from '@/shared/contracts/actions';

describe('contracts', () => {
  it('validates admin requests by action contract', () => {
    const valid = adminRequestSchema.safeParse({
      action: ADMIN_ACTIONS.WORKSPACES_UPDATE,
      workspaceId: 'ws-1',
      name: 'New Name',
    });
    expect(valid.success).toBe(true);

    const invalid = adminRequestSchema.safeParse({
      action: ADMIN_ACTIONS.WORKSPACES_UPDATE,
      workspaceId: '',
      name: '',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates invite requests by action contract', () => {
    const valid = inviteRequestSchema.safeParse({
      action: INVITE_ACTIONS.CREATE,
      workspaceId: 'ws-1',
      email: 'user@example.com',
      role: 'viewer',
      groupId: null,
    });
    expect(valid.success).toBe(true);

    const invalid = inviteRequestSchema.safeParse({
      action: INVITE_ACTIONS.ACCEPT,
      token: '',
    });
    expect(invalid.success).toBe(false);
  });
});
