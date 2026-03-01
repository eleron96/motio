export const getRedirectTargetFromSearch = (search: string): string | null => {
  const searchParams = new URLSearchParams(search);
  const redirect = searchParams.get('redirect');
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return null;
  }
  return redirect;
};

export const buildAuthPath = (redirectTarget: string | null | undefined): string => (
  redirectTarget ? `/auth?redirect=${encodeURIComponent(redirectTarget)}` : '/auth'
);

export const getAuthRecoveryPath = (search: string): string => (
  buildAuthPath(getRedirectTargetFromSearch(search))
);
