import { describe, expect, it } from 'vitest';
import { matchesWorkspaceMemberSearch } from '@/shared/domain/workspaceMemberSearch';

describe('matchesWorkspaceMemberSearch', () => {
  it('matches by display name or email', () => {
    expect(matchesWorkspaceMemberSearch({
      displayName: 'Anna Petrova',
      email: 'anna@example.com',
      role: 'editor',
      groupName: 'Design',
    }, 'anna')).toBe(true);

    expect(matchesWorkspaceMemberSearch({
      displayName: 'Anna Petrova',
      email: 'anna@example.com',
      role: 'editor',
      groupName: 'Design',
    }, 'example.com')).toBe(true);
  });

  it('matches by role or group name', () => {
    expect(matchesWorkspaceMemberSearch({
      displayName: 'Ivan',
      email: 'ivan@example.com',
      role: 'viewer',
      groupName: 'Support',
    }, 'viewer')).toBe(true);

    expect(matchesWorkspaceMemberSearch({
      displayName: 'Ivan',
      email: 'ivan@example.com',
      role: 'viewer',
      groupName: 'Support',
    }, 'support')).toBe(true);
  });

  it('returns true for empty query and false for unrelated values', () => {
    expect(matchesWorkspaceMemberSearch({
      displayName: 'Niko',
      email: 'niko@example.com',
    }, '')).toBe(true);

    expect(matchesWorkspaceMemberSearch({
      displayName: 'Niko',
      email: 'niko@example.com',
    }, 'anna')).toBe(false);
  });
});
