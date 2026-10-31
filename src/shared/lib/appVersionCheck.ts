// Which version the server is serving right now, read from a fresh index.html
// (<meta name="motio-version">, written at build time by vite/releaseArtifacts).
// index.html is served with no-cache, so this is always the current release.

const VERSION_META_PATTERN = /<meta\s+name="motio-version"\s+content="([^"]+)"/;

export const parsePublishedAppVersion = (html: string): string | null => (
  VERSION_META_PATTERN.exec(html)?.[1] ?? null
);

export const fetchPublishedAppVersion = async (): Promise<string | null> => {
  const response = await fetch('/app', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) return null;
  return parsePublishedAppVersion(await response.text());
};
