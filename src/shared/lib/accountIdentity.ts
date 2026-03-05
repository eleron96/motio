type AccountUserLike = {
  email?: string | null;
  id?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  } | null;
};

const trimToNull = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const getAccountSignedInLabel = (
  user: AccountUserLike | null | undefined,
  fallbackLabel: string,
) => (
  trimToNull(user?.email)
  ?? trimToNull(user?.user_metadata?.full_name)
  ?? trimToNull(user?.user_metadata?.name)
  ?? trimToNull(user?.id)
  ?? fallbackLabel
);

export const getAccountInitials = (
  displayName: string | null | undefined,
  signedInLabel: string | null | undefined,
  fallbackInitials = 'U',
) => {
  const avatarSource = trimToNull(displayName) ?? trimToNull(signedInLabel) ?? '';
  if (!avatarSource) return fallbackInitials;

  const normalizedSource = avatarSource.split('@')[0] ?? avatarSource;
  const initials = normalizedSource
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || fallbackInitials;
};
