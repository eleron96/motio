import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3);

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface UseCountUpOptions {
  durationMs?: number;
  decimals?: number;
}

/**
 * Animates a number from 0 up to `target` with an ease-out curve while `run`
 * is true. Snaps straight to `target` when `run` is false, when the user
 * prefers reduced motion, or when rAF is unavailable (SSR / tests).
 */
export const useCountUp = (
  target: number,
  run: boolean,
  { durationMs = 900, decimals = 0 }: UseCountUpOptions = {},
): number => {
  const [value, setValue] = useState(run ? 0 : target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!run || prefersReducedMotion()
      || typeof window === 'undefined'
      || typeof window.requestAnimationFrame !== 'function') {
      setValue(target);
      return undefined;
    }

    const factor = 10 ** decimals;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min(1, (ts - startTs) / durationMs);
      setValue(Math.round(target * easeOutCubic(progress) * factor) / factor);
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    setValue(0);
    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [target, run, durationMs, decimals]);

  return value;
};
