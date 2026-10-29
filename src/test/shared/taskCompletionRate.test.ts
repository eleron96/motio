import { describe, expect, it } from 'vitest';
import { isTaskStartedBy, toCompletionPercent } from '@/shared/domain/taskCompletionRate';

describe('isTaskStartedBy', () => {
  it('counts tasks starting today or earlier as started', () => {
    expect(isTaskStartedBy('2026-06-14', '2026-06-14')).toBe(true);
    expect(isTaskStartedBy('2026-05-30', '2026-06-14')).toBe(true);
  });

  it('treats tasks starting after today as not started', () => {
    expect(isTaskStartedBy('2026-06-15', '2026-06-14')).toBe(false);
  });

  it('compares calendar days even when the start carries a time', () => {
    expect(isTaskStartedBy('2026-06-14T09:00:00', '2026-06-14')).toBe(true);
  });

  it('treats a missing start date as not started', () => {
    expect(isTaskStartedBy(null, '2026-06-14')).toBe(false);
    expect(isTaskStartedBy('', '2026-06-14')).toBe(false);
  });
});

describe('toCompletionPercent', () => {
  it('rounds the share to a whole percent', () => {
    expect(toCompletionPercent(4, 7)).toBe(57);
    expect(toCompletionPercent(3, 3)).toBe(100);
  });

  it('returns 0 instead of dividing by zero', () => {
    expect(toCompletionPercent(0, 0)).toBe(0);
  });
});
