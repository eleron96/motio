/**
 * One pending timeout at a time: setting it again replaces the one waiting,
 * and `clear` drops it. Saves the hand-written "clear, null, set again" dance
 * around a `setTimeout` handle.
 */
export const createTimeoutSlot = () => {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    set(callback: () => void, delayMs: number) {
      if (handle !== null) clearTimeout(handle);
      handle = setTimeout(() => {
        handle = null;
        callback();
      }, delayMs);
    },
    clear() {
      if (handle !== null) clearTimeout(handle);
      handle = null;
    },
    get pending() {
      return handle !== null;
    },
  };
};
