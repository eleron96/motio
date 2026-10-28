import { describe, expect, it } from 'vitest';

import {
  createTestEmailThrottle,
  describeMailError,
  isUpdateCheckEnabled,
  parseLatestRelease,
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
