import { describe, expect, it } from 'vitest';

import {
  groupPathsWithParents,
  normalizeGroupPath,
  planGroupWorkspaceSync,
  type GroupWorkspaceMapping,
} from '../../../infra/supabase/functions/_shared/groupWorkspaces';

const mappings: GroupWorkspaceMapping[] = [
  { groupPath: '/Design', workspaceId: 'ws-design', role: 'editor' },
  { groupPath: '/Company', workspaceId: 'ws-all', role: 'viewer' },
  { groupPath: '/Company/Leads', workspaceId: 'ws-all', role: 'admin' },
];

const plan = (overrides: Partial<Parameters<typeof planGroupWorkspaceSync>[0]> = {}) =>
  planGroupWorkspaceSync({
    groupPaths: [],
    mappings,
    memberWorkspaceIds: [],
    grantedWorkspaceIds: [],
    ownedWorkspaceIds: [],
    removeEnabled: false,
    ...overrides,
  });

describe('group paths', () => {
  it('writes a group the way Keycloak shows its path', () => {
    expect(normalizeGroupPath('Design')).toBe('/Design');
    expect(normalizeGroupPath(' /Company//Design/ ')).toBe('/Company/Design');
    expect(normalizeGroupPath('  ')).toBe('');
  });

  it('counts a subgroup as its parents too', () => {
    expect([...groupPathsWithParents(['/Company/Leads/North'])]).toEqual([
      '/Company',
      '/Company/Leads',
      '/Company/Leads/North',
    ]);
  });
});

describe('planGroupWorkspaceSync', () => {
  it('adds the workspaces of the groups the person is in', () => {
    expect(plan({ groupPaths: ['/Design'] }).add).toEqual([{ workspaceId: 'ws-design', role: 'editor' }]);
  });

  it('gives the highest role when several groups map to one workspace, subgroups included', () => {
    expect(plan({ groupPaths: ['/Company/Leads'] }).add).toEqual([{ workspaceId: 'ws-all', role: 'admin' }]);
    expect(plan({ groupPaths: ['/Company/Sales'] }).add).toEqual([{ workspaceId: 'ws-all', role: 'viewer' }]);
  });

  it('leaves a member alone: no second membership, no role change', () => {
    const result = plan({ groupPaths: ['/Company/Leads', '/Design'], memberWorkspaceIds: ['ws-all'] });
    expect(result.add).toEqual([{ workspaceId: 'ws-design', role: 'editor' }]);
  });

  it('only adds by default, even after the person left the group', () => {
    const result = plan({ groupPaths: [], memberWorkspaceIds: ['ws-design'], grantedWorkspaceIds: ['ws-design'] });
    expect(result).toEqual({ add: [], remove: [], forgetGrants: [], changeRole: [], manualRoles: [], recordGrantRoles: [] });
  });

  it('with removal on, takes back only what a group gave', () => {
    const result = plan({
      groupPaths: [],
      memberWorkspaceIds: ['ws-design', 'ws-all'],
      grantedWorkspaceIds: ['ws-design'],
      removeEnabled: true,
    });
    expect(result.remove).toEqual(['ws-design']);
  });

  it('never takes away the workspace the person owns', () => {
    const result = plan({
      memberWorkspaceIds: ['ws-design'],
      grantedWorkspaceIds: ['ws-design'],
      ownedWorkspaceIds: ['ws-design'],
      removeEnabled: true,
    });
    expect(result.remove).toEqual([]);
  });

  it('keeps access while another group still maps to the workspace', () => {
    const result = plan({
      groupPaths: ['/Company/Sales'],
      memberWorkspaceIds: ['ws-all'],
      grantedWorkspaceIds: ['ws-all'],
      removeEnabled: true,
    });
    expect(result.remove).toEqual([]);
  });

  it('puts someone removed by hand back while the group still says so', () => {
    const result = plan({ groupPaths: ['/Design'], grantedWorkspaceIds: ['ws-design'] });
    expect(result.add).toEqual([{ workspaceId: 'ws-design', role: 'editor' }]);
    expect(result.forgetGrants).toEqual([]);
  });

  it('forgets a grant once neither the membership nor a group is left', () => {
    expect(plan({ grantedWorkspaceIds: ['ws-design'] }).forgetGrants).toEqual(['ws-design']);
  });

  describe('roles with role sync (groups.syncRoles)', () => {
    // Anna was put into ws-design as an editor by /Design.
    const given = {
      memberWorkspaceIds: ['ws-design'],
      grantedWorkspaceIds: ['ws-design'],
      memberRoles: { 'ws-design': 'editor' },
      grantedRoles: { 'ws-design': 'editor' } as Record<string, string | null>,
    };
    const roleMappings: GroupWorkspaceMapping[] = [
      { groupPath: '/Design', workspaceId: 'ws-design', role: 'editor' },
      { groupPath: '/Staff', workspaceId: 'ws-design', role: 'viewer' },
      { groupPath: '/Leads', workspaceId: 'ws-design', role: 'admin' },
    ];
    const rolePlan = (overrides: Partial<Parameters<typeof planGroupWorkspaceSync>[0]>) =>
      plan({ mappings: roleMappings, ...given, syncRoles: true, ...overrides });

    it('changes nothing while role sync is off: a member keeps their role, as before', () => {
      const result = rolePlan({ groupPaths: ['/Staff'], syncRoles: false });
      expect(result.changeRole).toEqual([]);
      expect(result.manualRoles).toEqual([]);
    });

    it('moves the role down when the person moves to a group with a lower role', () => {
      expect(rolePlan({ groupPaths: ['/Staff'] }).changeRole)
        .toEqual([{ workspaceId: 'ws-design', role: 'viewer', from: 'editor' }]);
    });

    it('moves the role up, to the highest role of all their groups', () => {
      expect(rolePlan({ groupPaths: ['/Staff', '/Leads'] }).changeRole)
        .toEqual([{ workspaceId: 'ws-design', role: 'admin', from: 'editor' }]);
    });

    it('leaves the role alone while the groups still give the same role', () => {
      expect(rolePlan({ groupPaths: ['/Design', '/Staff'] }).changeRole).toEqual([]);
    });

    it('never overrides a role a workspace admin changed by hand', () => {
      const result = rolePlan({ groupPaths: ['/Staff'], memberRoles: { 'ws-design': 'admin' } });
      expect(result.changeRole).toEqual([]);
      expect(result.manualRoles).toEqual(['ws-design']);
    });

    it('never touches people added by hand or by an invitation (no grant)', () => {
      const result = rolePlan({ groupPaths: ['/Staff'], grantedWorkspaceIds: [], grantedRoles: {} });
      expect(result.changeRole).toEqual([]);
    });

    it('never touches the workspace the person owns', () => {
      const result = rolePlan({ groupPaths: ['/Staff'], ownedWorkspaceIds: ['ws-design'] });
      expect(result.changeRole).toEqual([]);
    });

    it('leaves a membership no group gives any more to removal', () => {
      expect(rolePlan({ groupPaths: [] }).changeRole).toEqual([]);
      const removing = rolePlan({ groupPaths: [], removeEnabled: true });
      expect(removing.remove).toEqual(['ws-design']);
      expect(removing.changeRole).toEqual([]);
    });

    it('records the current role of an older grant first, then follows the groups next time', () => {
      const result = rolePlan({ groupPaths: ['/Staff'], grantedRoles: { 'ws-design': null } });
      expect(result.recordGrantRoles).toEqual([{ workspaceId: 'ws-design', role: 'editor' }]);
      expect(result.changeRole).toEqual([]);
    });

    it('records the role of an older grant even with role sync off', () => {
      const result = rolePlan({ groupPaths: ['/Design'], grantedRoles: {}, syncRoles: false });
      expect(result.recordGrantRoles).toEqual([{ workspaceId: 'ws-design', role: 'editor' }]);
    });
  });

  it('matches typed paths regardless of slashes', () => {
    const result = planGroupWorkspaceSync({
      groupPaths: ['/Design'],
      mappings: [{ groupPath: 'Design/', workspaceId: 'ws-design', role: 'viewer' }],
      memberWorkspaceIds: [],
      grantedWorkspaceIds: [],
      ownedWorkspaceIds: [],
      removeEnabled: false,
    });
    expect(result.add).toEqual([{ workspaceId: 'ws-design', role: 'viewer' }]);
  });
});
