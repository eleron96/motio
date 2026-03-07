import { describe, expect, it } from 'vitest';
import { getCompactPersonName } from '@/shared/domain/personName';

describe('getCompactPersonName', () => {
  it('keeps short names unchanged', () => {
    expect(getCompactPersonName('Иван Петров')).toBe('Иван Петров');
  });

  it('shortens long names to first name and last initial when possible', () => {
    expect(getCompactPersonName('Alexandra Robertson')).toBe('Alexandra R.');
  });

  it('falls back to first initial and last name for very long first names', () => {
    expect(getCompactPersonName('Alexandrianna Robertson')).toBe('A. Robertson');
  });

  it('builds initials for email-like labels', () => {
    expect(getCompactPersonName('very.long.person@example.com')).toBe('VL');
  });

  it('truncates a single long token when initials are not available', () => {
    expect(getCompactPersonName('Supercalifragilistic')).toBe('Supercalifrag…');
  });
});
