import { describe, expect, it } from 'vitest';
import { adminAuditEntry, groupSyncAuditEntries } from '../../../infra/supabase/functions/_shared/adminAudit';

describe('activity log: what an admin action leaves behind', () => {
  it('records a setting change with its key and value, and a reset as null', () => {
    expect(adminAuditEntry('settings.update', { key: 'timeline.density', value: true })).toEqual({
      action: 'settings.update', workspaceId: null, targetUserId: null, details: { key: 'timeline.density', value: true },
    });
    expect(adminAuditEntry('settings.update', { key: 'timeline.density', value: null })?.details.value).toBeNull();
  });

  it('records membership changes with the workspace, the person and the role', () => {
    expect(adminAuditEntry('workspaces.setMemberRole', { workspaceId: 'w1', userId: 'u1', role: 'editor' })).toEqual({
      action: 'workspaces.setMemberRole', workspaceId: 'w1', targetUserId: 'u1', details: { role: 'editor' },
    });
    expect(adminAuditEntry('workspaces.removeMember', { workspaceId: 'w1', userId: 'u1' })?.targetUserId).toBe('u1');
  });

  it('keeps no message bodies, addresses or other free text it does not need', () => {
    const broadcast = adminAuditEntry('broadcasts.send', {
      subject: 'Maintenance', body: 'Secret plans', audienceKind: 'domain', audienceValue: 'example.com', messageType: 'service',
    });
    expect(broadcast?.details).toEqual({ subject: 'Maintenance', audienceKind: 'domain', messageType: 'service' });
    expect(JSON.stringify(broadcast)).not.toContain('Secret plans');
    expect(JSON.stringify(broadcast)).not.toContain('example.com');
  });

  it('leaves reads and unknown actions out', () => {
    expect(adminAuditEntry('users.list', {})).toBeNull();
    expect(adminAuditEntry('settings.list', {})).toBeNull();
    expect(adminAuditEntry('audit.list', {})).toBeNull();
    expect(adminAuditEntry('something.new', { a: 1 })).toBeNull();
  });

  it('turns what the group sync did into entries without an actor', () => {
    expect(groupSyncAuditEntries('u1', [
      { kind: 'added', workspaceId: 'w1', role: 'viewer' },
      { kind: 'roleChanged', workspaceId: 'w2', from: 'viewer', role: 'editor' },
      { kind: 'removed', workspaceId: 'w3' },
    ])).toEqual([
      { action: 'groups.added', workspaceId: 'w1', targetUserId: 'u1', details: { via: 'groups', role: 'viewer' } },
      { action: 'groups.roleChanged', workspaceId: 'w2', targetUserId: 'u1', details: { via: 'groups', from: 'viewer', role: 'editor' } },
      { action: 'groups.removed', workspaceId: 'w3', targetUserId: 'u1', details: { via: 'groups' } },
    ]);
  });

  it('uses action names the database accepts', () => {
    for (const action of ['settings.update', 'workspaces.setMemberRole', 'groups.roleChanged', 'invites.revoke']) {
      expect(action).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
    }
  });
});
