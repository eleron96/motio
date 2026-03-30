/**
 * Generates a deterministic HSL background color from a userId string.
 * The color is consistent across all renders — no DB storage needed.
 */
export const getMonogramColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // Convert to 32bit integer
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
};
