// Loads the release-notes chunk (the full changelog) when the dialog opens.
//
// In a production build the chunk's URL comes from <meta name="motio-release-notes">
// in index.html (vite/releaseArtifacts): importing it by name here would put
// its hash — which changes with every changelog edit — into this file's chunk
// and, through it, into almost every other chunk's hash.
type ReleaseNotesModule = typeof import('@/shared/lib/releaseNotes');

export const loadReleaseNotesModule = (): Promise<ReleaseNotesModule> => {
  if (import.meta.env.DEV) return import('@/shared/lib/releaseNotes');
  const url = typeof document === 'undefined'
    ? null
    : document.querySelector('meta[name="motio-release-notes"]')?.getAttribute('content');
  if (!url) return Promise.reject(new Error('Release notes are not published in this build'));
  return import(/* @vite-ignore */ url) as Promise<ReleaseNotesModule>;
};
