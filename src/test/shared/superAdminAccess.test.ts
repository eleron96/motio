import { describe, expect, it } from 'vitest';

import { decideSuperAdminAccess } from '../../../infra/supabase/functions/_shared/superAdminAccess';

const ROLE = 'app_super_admin';

describe('decideSuperAdminAccess', () => {
  it('keeps the default behaviour: only a direct role counts', () => {
    expect(decideSuperAdminAccess({
      directRoleNames: [],
      effectiveRoleNames: [ROLE],
      fromGroups: false,
      inTable: false,
    })).toEqual({ allowed: false, cache: 'keep' });

    expect(decideSuperAdminAccess({
      directRoleNames: [ROLE],
      effectiveRoleNames: [],
      fromGroups: false,
      inTable: false,
    })).toEqual({ allowed: true, cache: 'add' });
  });

  it('lets a group grant access without caching it', () => {
    expect(decideSuperAdminAccess({
      directRoleNames: ['app_workspace_admin'],
      effectiveRoleNames: ['app_workspace_admin', ROLE],
      fromGroups: true,
      inTable: false,
    })).toEqual({ allowed: true, cache: 'keep' });
  });

  it('drops a cached entry that has no direct role behind it', () => {
    expect(decideSuperAdminAccess({
      directRoleNames: [],
      effectiveRoleNames: [ROLE],
      fromGroups: true,
      inTable: true,
    })).toEqual({ allowed: true, cache: 'remove' });
  });

  it('denies access once the user leaves the group', () => {
    expect(decideSuperAdminAccess({
      directRoleNames: [],
      effectiveRoleNames: [],
      fromGroups: true,
      inTable: false,
    })).toEqual({ allowed: false, cache: 'keep' });
  });

  it('keeps a direct role cached when groups are on', () => {
    expect(decideSuperAdminAccess({
      directRoleNames: [ROLE],
      effectiveRoleNames: [ROLE],
      fromGroups: true,
      inTable: true,
    })).toEqual({ allowed: true, cache: 'keep' });
  });
});
