import { describe, expect, it } from 'vitest';
import { getLatestReleaseNotes } from '@/shared/lib/releaseNotes';

describe('releaseNotes', () => {
  it('returns localized latest release notes without placeholder entries', () => {
    const ruSections = getLatestReleaseNotes('ru');
    const enSections = getLatestReleaseNotes('en');

    expect(ruSections.length).toBeGreaterThan(0);
    expect(enSections.length).toBeGreaterThan(0);

    expect(ruSections.flatMap((section) => section.items)).not.toContain('Нет зафиксированных изменений.');
    expect(enSections.flatMap((section) => section.items)).not.toContain('No documented changes.');
  });
});
