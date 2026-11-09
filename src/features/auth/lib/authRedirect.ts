// Any origin works here: the target is resolved against it only to see whether
// it stays on that origin. `.invalid` can never resolve to a real host.
const PROBE_ORIGIN = 'https://motio.invalid';

/**
 * The page to return to after sign-in, from `?redirect=`, or null.
 *
 * Only a path on this site is accepted. Checking the prefix is not enough:
 * browsers read `\` as `/` and drop tabs and newlines, so `/\evil.example`
 * becomes `//evil.example` — another site. The target is therefore resolved
 * the way the browser will resolve it, and the normalised path is returned, so
 * what the app navigates to is exactly what was checked.
 */
export const getRedirectTargetFromSearch = (search: string): string | null => {
  const searchParams = new URLSearchParams(search);
  const redirect = searchParams.get('redirect');
  if (!redirect || !redirect.startsWith('/')) {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(redirect, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (resolved.origin !== PROBE_ORIGIN) {
    return null;
  }
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};

export const buildAuthPath = (redirectTarget: string | null | undefined): string => (
  redirectTarget ? `/auth?redirect=${encodeURIComponent(redirectTarget)}` : '/auth'
);

export const getAuthRecoveryPath = (search: string): string => (
  buildAuthPath(getRedirectTargetFromSearch(search))
);
