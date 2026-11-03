type Backoff = { baseMs: number; maxMs: number; minMs: number; jitterRatio: number };

/**
 * Exponential backoff with jitter: the delay doubles with every failure up to
 * `maxMs`, and a random ±`jitterRatio` share keeps many open tabs from polling
 * in step. Never shorter than `minMs`.
 */
const backoffDelayMs = (
  { baseMs, maxMs, minMs, jitterRatio }: Backoff,
  failureCount: number,
  random: () => number,
): number => {
  const baseDelay = Math.min(baseMs * (2 ** failureCount), maxMs);
  const jitterWindow = Math.round(baseDelay * jitterRatio);
  const jitter = Math.round((random() * 2 - 1) * jitterWindow);
  return Math.max(minMs, baseDelay + jitter);
};

/** Planner live sync, while realtime is down: 45 s doubling to 3 min, ±18%. */
export const fallbackPollDelayMs = (failureCount: number, random: () => number = Math.random) => (
  backoffDelayMs({ baseMs: 45_000, maxMs: 180_000, minMs: 20_000, jitterRatio: 0.18 }, failureCount, random)
);

/** The notification bell's poll on a visible tab: 75 s doubling to 8 min, ±20%. */
export const inboxPollDelayMs = (failureCount: number, random: () => number = Math.random) => (
  backoffDelayMs({ baseMs: 75_000, maxMs: 8 * 60_000, minMs: 15_000, jitterRatio: 0.2 }, failureCount, random)
);
