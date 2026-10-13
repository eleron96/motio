import { describe, expect, it } from 'vitest';
import { PAN_GRACE_MS, isWithinPanGrace } from '@/features/planner/lib/panGrace';

describe('isWithinPanGrace', () => {
  it('is off when no pan has happened yet', () => {
    expect(isWithinPanGrace(0, 1_000)).toBe(false);
  });

  it('is on right after a pan and off once the window passes', () => {
    const endedAt = 10_000;
    expect(isWithinPanGrace(endedAt, endedAt)).toBe(true);
    expect(isWithinPanGrace(endedAt, endedAt + PAN_GRACE_MS - 1)).toBe(true);
    expect(isWithinPanGrace(endedAt, endedAt + PAN_GRACE_MS)).toBe(false);
  });

  it('ignores a pan timestamp from the future (clock jump)', () => {
    expect(isWithinPanGrace(10_000, 9_000)).toBe(false);
  });
});
