import { describe, expect, it, vi } from 'vitest';
import { formatWorkspaceMemberActivity } from '@/shared/lib/workspaceMemberActivity';
import { WorkspaceMemberActivityEntry } from '@/shared/domain/workspaceMemberActivity';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const makeEntry = (overrides: Partial<WorkspaceMemberActivityEntry>): WorkspaceMemberActivityEntry => ({
  id: 'event-1',
  workspaceId: 'workspace-1',
  action: 'member_role_changed',
  actorUserId: 'actor-1',
  actorLabel: 'Niko',
  targetUserId: 'target-1',
  targetLabel: 'Ivan',
  targetEmail: 'ivan@example.com',
  details: {},
  createdAt: '2026-03-07T10:00:00.000Z',
  ...overrides,
});

describe('workspaceMemberActivity formatter', () => {
  it('formats role changes', () => {
    const message = formatWorkspaceMemberActivity(makeEntry({
      action: 'member_role_changed',
      details: {
        previousRole: 'viewer',
        nextRole: 'editor',
      },
    }));

    expect(message).toBe('Niko changed Ivan from viewer to editor.');
  });

  it('formats invites with group details', () => {
    const message = formatWorkspaceMemberActivity(makeEntry({
      action: 'invite_created',
      targetUserId: null,
      targetLabel: 'anna@example.com',
      targetEmail: 'anna@example.com',
      details: {
        inviteRole: 'admin',
        inviteGroupName: 'Design',
      },
    }));

    expect(message).toBe('Niko invited anna@example.com as admin in Design.');
  });

  it('formats disabled status transitions', () => {
    const message = formatWorkspaceMemberActivity(makeEntry({
      action: 'member_status_changed',
      details: {
        previousStatus: 'active',
        nextStatus: 'disabled',
      },
    }));

    expect(message).toBe('Niko changed Ivan status from active to disabled.');
  });
});
