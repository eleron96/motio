import { describe, expect, it } from 'vitest';
import { rowNamesByUserId } from '@/features/planner/lib/personRowNames';

describe('rowNamesByUserId', () => {
  it('names accounts by their row and skips people without an account or a name', () => {
    const names = rowNamesByUserId([
      { name: ' Mark Sullivan ', userId: 'mark' },
      { name: 'External contractor', userId: null },
      { name: '   ', userId: 'blank' },
      { name: 'Mark (old row)', userId: 'mark' },
    ]);

    expect([...names]).toEqual([['mark', 'Mark Sullivan']]);
  });
});
