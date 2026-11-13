import { describe, expect, it } from 'vitest';

import {
  createTestEmailThrottle,
  describeMailError,
  isUpdateCheckEnabled,
  parseLatestRelease,
  parseReleaseChanges,
  parseReleaseList,
} from '../../../infra/supabase/functions/_shared/systemStatus';

describe('parseLatestRelease', () => {
  it('reads tag, link and date from the GitHub reply', () => {
    expect(parseLatestRelease({
      tag_name: 'v0.10.27',
      html_url: 'https://github.com/eleron96/motio/releases/tag/v0.10.27',
      published_at: '2026-10-28T11:20:00Z',
    })).toEqual({
      tag: 'v0.10.27',
      url: 'https://github.com/eleron96/motio/releases/tag/v0.10.27',
      publishedAt: '2026-10-28T11:20:00Z',
    });
  });

  it('rejects anything that is not a release of this repository', () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'nightly', html_url: 'https://github.com/x' })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v1.0.0', html_url: 'https://evil.example/release' })).toBeNull();
  });
});

describe('parseReleaseChanges', () => {
  it('keeps the bullet lines as plain text and drops headings', () => {
    expect(parseReleaseChanges('### Fixed\n- First   fix.\n\n### Added\n* Second thing.\nloose prose\n')).toEqual([
      'First fix.',
      'Second thing.',
    ]);
  });

  it('bounds what one release can carry', () => {
    const notes = Array.from({ length: 60 }, (_, index) => `- change ${index} ${'x'.repeat(900)}`).join('\n');
    const changes = parseReleaseChanges(notes);
    expect(changes).toHaveLength(40);
    expect(changes[0]).toHaveLength(600);
    expect(parseReleaseChanges(null)).toEqual([]);
  });
});

describe('parseReleaseList', () => {
  const entry = (tag: string, extra: Record<string, unknown> = {}) => ({
    tag_name: tag,
    html_url: `https://github.com/eleron96/motio/releases/tag/${tag}`,
    published_at: '2026-11-01T10:00:00Z',
    body: `### Added\n- Notes of ${tag}.`,
    ...extra,
  });

  it('lists published releases, newest version first, with their notes', () => {
    const releases = parseReleaseList([
      entry('v0.10.9'),
      entry('v0.11.0'),
      entry('v0.10.72'),
      entry('v0.12.0', { draft: true }),
      entry('v0.12.1', { prerelease: true }),
      entry('nightly'),
    ]);
    expect(releases.map((release) => release.tag)).toEqual(['v0.11.0', 'v0.10.72', 'v0.10.9']);
    expect(releases[0].changes).toEqual(['Notes of v0.11.0.']);
  });

  it('answers with nothing when GitHub did not send a list', () => {
    expect(parseReleaseList({ message: 'API rate limit exceeded' })).toEqual([]);
    expect(parseReleaseList(null)).toEqual([]);
  });
});

describe('isUpdateCheckEnabled', () => {
  it('is on unless switched off explicitly', () => {
    expect(isUpdateCheckEnabled(undefined)).toBe(true);
    expect(isUpdateCheckEnabled('')).toBe(true);
    expect(isUpdateCheckEnabled('true')).toBe(true);
    expect(isUpdateCheckEnabled('false')).toBe(false);
    expect(isUpdateCheckEnabled(' OFF ')).toBe(false);
    expect(isUpdateCheckEnabled('0')).toBe(false);
  });
});

describe('createTestEmailThrottle', () => {
  it('allows one test email per admin per minute', () => {
    const throttle = createTestEmailThrottle(60_000);
    expect(throttle('admin-1', 0)).toBe(0);
    expect(throttle('admin-1', 10_000)).toBe(50);
    expect(throttle('admin-2', 10_000)).toBe(0);
    expect(throttle('admin-1', 60_000)).toBe(0);
  });
});

describe('describeMailError', () => {
  it('hides the SMTP password and keeps the message short', () => {
    const message = describeMailError(new Error(`535 auth failed for s3cret-pass\n  at smtp`), 's3cret-pass');
    expect(message).toBe('535 auth failed for *** at smtp');
    expect(describeMailError('x'.repeat(500), '')).toHaveLength(200);
  });
});
