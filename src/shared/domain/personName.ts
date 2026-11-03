const normalizeWhitespace = (value: string | null | undefined) => (
  value?.trim().replace(/\s+/g, ' ') ?? ''
);

const getLeadingLetter = (value: string) => (
  Array.from(value).find((char) => /\p{L}|\p{N}/u.test(char))?.toUpperCase() ?? ''
);

export const getPersonMonogram = (
  value: string | null | undefined,
  fallback = '?',
) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return fallback;

  const compactSource = normalized.split('@')[0] ?? normalized;
  const parts = compactSource.split(/[\s._-]+/).filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map(getLeadingLetter)
    .filter(Boolean)
    .join('');

  if (initials) {
    return initials;
  }

  return getLeadingLetter(compactSource) || fallback;
};
