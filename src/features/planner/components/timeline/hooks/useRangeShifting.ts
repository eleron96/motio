import { useEffect, useState } from 'react';

/**
 * True for the commit in which `rangeKey` changes and the two frames after it.
 *
 * Task bars glide (`.task-bar` transitions `left`), so a dropped task slides
 * into place. When the day range itself shifts — the re-anchor at the scroll
 * edge, "Today", the arrows, a deep link, Day ↔ Week — every bar's `left` jumps
 * by thousands of pixels while the scroll compensation moves the grid at once,
 * and the bars flew across the grid for the length of the transition. The flag
 * arrives in the same commit as the new range (a class on the scroll container
 * that switches the transition off), so the jump is never animated, and it is
 * dropped once that commit has been painted.
 */
export function useRangeShifting(rangeKey: string): boolean {
  const [settledKey, setSettledKey] = useState(rangeKey);
  const shifting = settledKey !== rangeKey;

  useEffect(() => {
    if (!shifting) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettledKey(rangeKey));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [rangeKey, shifting]);

  return shifting;
}
