export const normalizeCanonicalPath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
};

export const buildCanonicalUrl = (origin: string, path: string): string => {
  const trimmedOrigin = origin.trim().replace(/\/+$/, "");
  const normalizedPath = normalizeCanonicalPath(path);
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  if (!trimmedOrigin) return normalizedPath;
  return `${trimmedOrigin}${normalizedPath}`;
};
