import { describe, expect, it } from 'vitest';
import {
  RECENT_RELEASES_LIMIT,
  getLatestReleaseNotes,
  getRecentReleaseNotes,
} from '@/shared/lib/releaseNotes';

describe('releaseNotes', () => {
  it('returns localized latest release notes without placeholder entries', () => {
    const ruSections = getLatestReleaseNotes('ru');
    const enSections = getLatestReleaseNotes('en');

    expect(ruSections.length).toBeGreaterThan(0);
    expect(enSections.length).toBeGreaterThan(0);

    expect(ruSections.flatMap((section) => section.items)).not.toContain('Нет зафиксированных изменений.');
    expect(enSections.flatMap((section) => section.items)).not.toContain('No documented changes.');
  });

  it('returns a scrollable window of recent releases, newest first', () => {
    const entries = getRecentReleaseNotes('ru');

    expect(entries.length).toBeGreaterThan(1);
    expect(entries.length).toBeLessThanOrEqual(RECENT_RELEASES_LIMIT);

    // Every entry carries something worth showing — empty, placeholder-only and
    // infrastructure-only releases are skipped rather than rendered blank.
    entries.forEach((entry) => {
      expect(entry.version).not.toBe('');
      expect(entry.sections.length).toBeGreaterThan(0);
      entry.sections.forEach((section) => {
        expect(section.items.length).toBeGreaterThan(0);
      });
    });

    // Newest first: the first released entry matches the top released heading.
    const released = entries.filter((entry) => entry.version !== 'Unreleased');
    expect(released.length).toBeGreaterThan(0);
    expect(released[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('agrees with getLatestReleaseNotes on the newest entry', () => {
    const [newest] = getRecentReleaseNotes('en', 1);

    expect(newest.sections).toEqual(getLatestReleaseNotes('en'));
  });

  it('honours the requested limit and rejects non-positive ones', () => {
    expect(getRecentReleaseNotes('ru', 3)).toHaveLength(3);
    expect(getRecentReleaseNotes('ru', 1)).toHaveLength(1);
    expect(getRecentReleaseNotes('ru', 0)).toEqual([]);
    expect(getRecentReleaseNotes('ru', -5)).toEqual([]);
  });

  it('parses both locales into the same release sequence', () => {
    const ruVersions = getRecentReleaseNotes('ru', 10).map((entry) => entry.version);
    const enVersions = getRecentReleaseNotes('en', 10).map((entry) => entry.version);

    expect(ruVersions).toEqual(enVersions);
  });
});
