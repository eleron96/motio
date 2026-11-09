// Comparing release versions ("0.10.44", "v0.11.0"). Pure, no IO.

const parseVersion = (value: string): number[] | null => {
  const match = value.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
};

/**
 * True when `candidate` raises the major or the minor number of the running
 * `current` version ("0.10.71" → "0.11.0"): an update worth interrupting an open
 * tab for. Patch releases ("0.10.72") are frequent and reach people quietly, the
 * next time the page loads. The owner marks an important release by its number
 * (`NEXT_VERSION=0.11.0`, AGENTS.md §5.4.3).
 */
export const isNotableUpdate = (current: string, candidate: string): boolean => {
  const a = parseVersion(current);
  const b = parseVersion(candidate);
  if (!a || !b) return false;
  if (b[0] !== a[0]) return b[0] > a[0];
  return b[1] > a[1];
};

/** True when `candidate` (e.g. "v0.11.0") is newer than the running `current` version. */
export const isNewerVersion = (current: string, candidate: string): boolean => {
  const a = parseVersion(current);
  const b = parseVersion(candidate);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b[index] !== a[index]) return b[index] > a[index];
  }
  return false;
};
