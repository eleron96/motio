import { afterEach, describe, expect, it, vi } from 'vitest';

// The version and the release-notes chunk are published through index.html
// (vite/releaseArtifacts), so release-only changes don't touch any JS hash.
describe('app version and release notes from index.html', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name^="motio-"]').forEach((node) => node.remove());
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  const addMeta = (name: string, content: string) => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
  };

  it('reads the version from <meta name="motio-version">', async () => {
    addMeta('motio-version', '0.10.44');
    const { APP_VERSION } = await import('@/shared/lib/appVersion');
    expect(APP_VERSION).toBe('0.10.44');
  });

  it('falls back to 0.0.0 without the tag or with garbage in it', async () => {
    expect((await import('@/shared/lib/appVersion')).APP_VERSION).toBe('0.0.0');
    vi.resetModules();
    addMeta('motio-version', 'not-a-version');
    expect((await import('@/shared/lib/appVersion')).APP_VERSION).toBe('0.0.0');
  });

  it('rejects instead of hanging when a build publishes no release-notes chunk', async () => {
    vi.stubEnv('DEV', false);
    const { loadReleaseNotesModule } = await import('@/shared/lib/releaseNotesLoader');
    await expect(loadReleaseNotesModule()).rejects.toThrow('not published');
  });

  it('parses the published version out of a fresh index.html', async () => {
    const { parsePublishedAppVersion } = await import('@/shared/lib/appVersionCheck');
    expect(parsePublishedAppVersion('<head><meta name="motio-version" content="0.10.45"></head>')).toBe('0.10.45');
    expect(parsePublishedAppVersion('<head></head>')).toBeNull();
  });
});
