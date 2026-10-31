import { useCallback, useEffect, useRef, useState } from 'react';

type PendingValue<T> = {
  value: T;
  key: string;
};

/**
 * Keeps a task field that stays open for several taps (assignees, tags) in
 * step with the person's taps instead of the store.
 *
 * The store only changes after the server answers, so a second tap used to be
 * counted from the stale value and quietly overwrote the first — only the last
 * tap reached the database. Here the latest picked value is kept locally while
 * writes are in flight, at most one write runs at a time and it always sends
 * the latest value. Once the last write settles the local copy is dropped and
 * the field shows the store again: the saved value, or the old one plus the
 * usual write-failure toast if the save failed.
 *
 * `key` identifies the task. Every write gets the key the value was picked
 * for, so taps made just before the card closes still reach their task.
 */
export function useSerialFieldWrite<T>(
  storeValue: T,
  write: (value: T, key: string) => Promise<unknown> | void,
  key: string | null,
): [T, (next: T) => void] {
  const [pending, setPending] = useState<PendingValue<T> | null>(null);
  const latestRef = useRef<PendingValue<T> | null>(null);
  const inFlightRef = useRef(false);
  const writeRef = useRef(write);
  writeRef.current = write;
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    setPending((current) => (current && current.key !== key ? null : current));
  }, [key]);

  const flush = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      while (latestRef.current) {
        const sent = latestRef.current;
        try {
          await writeRef.current(sent.value, sent.key);
        } catch {
          // The writer reports its own failure (toast + structured log).
        }
        if (latestRef.current === sent) {
          latestRef.current = null;
          setPending((current) => (current === sent ? null : current));
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const setValue = useCallback((next: T) => {
    const currentKey = keyRef.current;
    if (currentKey === null) return;
    const entry: PendingValue<T> = { value: next, key: currentKey };
    latestRef.current = entry;
    setPending(entry);
    void flush();
  }, [flush]);

  const value = pending && pending.key === key ? pending.value : storeValue;
  return [value, setValue];
}
