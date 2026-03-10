const normalizeWhitespace = (value: string | null | undefined) => (
  value?.trim().replace(/\s+/g, ' ') ?? ''
);

const getLeadingLetter = (value: string) => (
  Array.from(value).find((char) => /\p{L}|\p{N}/u.test(char))?.toUpperCase() ?? ''
);

export const getCompactPersonName = (
  value: string | null | undefined,
  maxLength = 14,
) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;

  const words = normalized.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const first = words[0];
    const last = words[words.length - 1];
    const lastInitial = getLeadingLetter(last);
    const firstInitial = getLeadingLetter(first);

    const firstWithLastInitial = lastInitial ? `${first} ${lastInitial}.` : first;
    if (firstWithLastInitial.length <= maxLength) {
      return firstWithLastInitial;
    }

    const firstInitialWithLast = firstInitial ? `${firstInitial}. ${last}` : last;
    if (firstInitialWithLast.length <= maxLength) {
      return firstInitialWithLast;
    }

    const initials = `${firstInitial}${lastInitial}`.trim();
    if (initials) {
      return initials;
    }
  }

  const compactSource = normalized.split('@')[0] ?? normalized;
  const compactParts = compactSource.split(/[\s._-]+/).filter(Boolean);
  if (compactParts.length >= 2) {
    const initials = compactParts
      .slice(0, 2)
      .map(getLeadingLetter)
      .join('');
    if (initials) {
      return initials;
    }
  }

  const shortened = Array.from(compactSource).slice(0, Math.max(1, maxLength - 1)).join('').trimEnd();
  return shortened ? `${shortened}…` : normalized;
};

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
