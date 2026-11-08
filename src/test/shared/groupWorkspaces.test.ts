import { describe, expect, it } from 'vitest';

import {
  groupPathsWithParents,
  isSettingOn,
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

describe('settings and group paths', () => {
  it('is off unless set to true', () => {
    expect(isSettingOn(undefined)).toBe(false);
    expect(isSettingOn('')).toBe(false);
    expect(isSettingOn('false')).toBe(false);
    expect(isSettingOn(' TRUE ')).toBe(true);
  });

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
    expect(result).toEqual({ add: [], remove: [], forgetGrants: [] });
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
