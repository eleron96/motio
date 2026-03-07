import { describe, expect, it } from 'vitest';
import { getCompactPersonName, getPersonMonogram } from '@/shared/domain/personName';

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

describe('getPersonMonogram', () => {
  it('builds two-letter initials from multi-word names', () => {
    expect(getPersonMonogram('Иван Петров')).toBe('ИП');
  });

  it('builds initials from email-like labels', () => {
    expect(getPersonMonogram('very.long.person@example.com')).toBe('VL');
  });

  it('falls back to a single leading character for one-word labels', () => {
    expect(getPersonMonogram('Madonna')).toBe('M');
  });

  it('uses fallback for empty values', () => {
    expect(getPersonMonogram('', 'U')).toBe('U');
  });
});
