// Comparing release versions ("0.10.44", "v0.11.0"). Pure, no IO.

const parseVersion = (value: string): number[] | null => {
  const match = value.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
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
