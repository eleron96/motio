import { describe, expect, it } from 'vitest';
import { getPersonMonogram } from '@/shared/domain/personName';

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
