import { describe, expect, it } from 'vitest';
import { fallbackPollDelayMs, inboxPollDelayMs } from '@/shared/domain/syncBackoff';

const middle = () => 0.5; // no jitter

describe('poll backoff', () => {
  it('starts at 45 s and doubles with every failure', () => {
    expect(fallbackPollDelayMs(0, middle)).toBe(45_000);
    expect(fallbackPollDelayMs(1, middle)).toBe(90_000);
    expect(fallbackPollDelayMs(2, middle)).toBe(180_000);
  });

  it('stops growing at 3 minutes', () => {
    expect(fallbackPollDelayMs(6, middle)).toBe(180_000);
  });

  it('spreads tabs by up to 18% either way', () => {
    expect(fallbackPollDelayMs(0, () => 0)).toBe(45_000 - 8_100);
    expect(fallbackPollDelayMs(0, () => 1)).toBe(45_000 + 8_100);
  });

  it('polls the bell on its own, slower schedule', () => {
    expect(inboxPollDelayMs(0, middle)).toBe(75_000);
    expect(inboxPollDelayMs(3, middle)).toBe(8 * 60_000);
    expect(inboxPollDelayMs(10, middle)).toBe(8 * 60_000);
  });
});
