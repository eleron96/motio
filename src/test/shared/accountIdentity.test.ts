import { describe, expect, it } from 'vitest';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';

describe('accountIdentity helpers', () => {
  it('prefers email in signed-in label when available', () => {
    const label = getAccountSignedInLabel({
      email: 'niko@example.com',
      user_metadata: { full_name: 'Niko G' },
      id: 'user-1',
    }, 'Unknown');

    expect(label).toBe('niko@example.com');
  });

  it('falls back from email to metadata and id for signed-in label', () => {
    const fromFullName = getAccountSignedInLabel({
      email: null,
      user_metadata: { full_name: 'Niko G', name: 'Niko' },
      id: 'user-1',
    }, 'Unknown');
    const fromName = getAccountSignedInLabel({
      email: null,
      user_metadata: { full_name: '', name: 'Niko' },
      id: 'user-1',
    }, 'Unknown');
    const fromId = getAccountSignedInLabel({
      email: null,
      user_metadata: null,
      id: 'user-1',
    }, 'Unknown');

    expect(fromFullName).toBe('Niko G');
    expect(fromName).toBe('Niko');
    expect(fromId).toBe('user-1');
  });

  it('builds initials from display name first', () => {
    expect(getAccountInitials('Niko Gamsahurdia', 'niko@example.com')).toBe('NG');
  });

  it('builds initials from email local part when display name is empty', () => {
    expect(getAccountInitials('', 'niko.g@example.com')).toBe('NG');
  });

  it('returns fallback initials when source has no letters', () => {
    expect(getAccountInitials('', '', 'U')).toBe('U');
  });
});
