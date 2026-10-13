/**
 * How long after a real drag-scroll a press on a task or time-off bar keeps
 * panning instead of grabbing the bar. Rapid pan strokes (press, drag,
 * release, press again) land on bars that slid under the cursor while the
 * timeline moved; without this window the next stroke drags the bar instead.
 */
export const PAN_GRACE_MS = 1000;

/** `lastPanEndAt` is the time a drag-scroll that actually moved ended (0 = never). */
export const isWithinPanGrace = (lastPanEndAt: number, now: number): boolean => (
  lastPanEndAt > 0 && now - lastPanEndAt >= 0 && now - lastPanEndAt < PAN_GRACE_MS
);
