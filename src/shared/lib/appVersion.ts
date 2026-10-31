// The app version lives apart from the release notes on purpose.
//
// `releaseNotes.ts` inlines both CHANGELOG files via `?raw` (~210 KB and
// growing by roughly a release per deploy). Anything that imports it statically
// drags that payload into its chunk, and `APP_VERSION` used to do exactly that
// from two always-mounted places — pulling the whole changelog onto the critical
// path of every authenticated page for the sake of a 7-byte string.
//
// Keep this module free of CHANGELOG imports.
//
// The version itself comes from <meta name="motio-version"> in index.html,
// written at build time (vite/releaseArtifacts), not from the bundle: baked into
// the entry chunk it changed the hash of nearly every chunk on every release.
const readVersionMeta = () => (
  typeof document === 'undefined'
    ? ''
    : document.querySelector('meta[name="motio-version"]')?.getAttribute('content') ?? ''
);

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

const normalizeVersion = (raw: string) => {
  const normalized = raw.trim();
  if (!normalized) return '0.0.0';
  if (!VERSION_PATTERN.test(normalized)) return '0.0.0';
  return normalized;
};

export const APP_VERSION = normalizeVersion(readVersionMeta());
