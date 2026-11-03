type IdleSchedulerWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Runs `callback` when the browser is idle, or after `timeoutMs` at the latest
 * (Safari has no requestIdleCallback: a plain timeout there). Returns a cancel.
 */
export const scheduleWhenIdle = (callback: () => void, timeoutMs: number): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const idleWindow = window as IdleSchedulerWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, timeoutMs);
  return () => window.clearTimeout(handle);
};
