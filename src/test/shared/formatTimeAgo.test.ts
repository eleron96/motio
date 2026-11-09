import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTimeAgo } from '@/shared/lib/dateFnsLocale';

// Relative times ("5 minutes ago") follow the interface language, not English always.
describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says how long ago in English', () => {
    expect(formatTimeAgo('2026-11-09T11:55:00Z', 'en')).toBe('5 minutes ago');
  });

  it('says how long ago in Russian', () => {
    expect(formatTimeAgo('2026-11-09T11:55:00Z', 'ru')).toBe('5 минут назад');
    expect(formatTimeAgo('2026-11-09T11:59:50Z', 'ru')).toBe('меньше минуты назад');
  });

  it('says how long ago in German', () => {
    expect(formatTimeAgo('2026-11-09T11:55:00Z', 'de')).toBe('vor 5 Minuten');
  });

  it('says how far ahead for a future date', () => {
    expect(formatTimeAgo('2026-12-09T12:00:00Z', 'en')).toBe('in about 1 month');
    expect(formatTimeAgo('2026-12-09T12:00:00Z', 'ru')).toBe('приблизительно через 1 месяц');
  });

  it('throws for a string that is not a date', () => {
    expect(() => formatTimeAgo('not a date', 'en')).toThrow(RangeError);
  });
});
