import { readFileSync } from "fs";
import path from "path";
import type { HtmlTagDescriptor, Plugin } from "vite";

// What changes on every release — the version number and the changelog — stays
// out of the JavaScript and is published through index.html instead (served
// with no-cache, so it is always current).
//
// Baked into the entry chunk, the version changed the entry's hash on every
// release, and with it the hash of every chunk that imports the entry: a
// returning visitor re-downloaded ~90% of the app (877 KB gzip) even after a
// release that changed no frontend code. The changelog did the same through
// the hashed name of the release-notes chunk, which the entry imported.
//
// Now: <meta name="motio-version"> carries the version (read by
// src/shared/lib/appVersion), and the release notes are a separate chunk whose
// URL sits in <meta name="motio-release-notes"> (loaded by
// src/shared/lib/releaseNotesLoader). Neither name appears in any other chunk.

export const VERSION_META = "motio-version";
export const RELEASE_NOTES_META = "motio-release-notes";
const RELEASE_NOTES_MODULE = "src/shared/lib/releaseNotes.ts";

export const readAppVersion = (root: string): string => (
  readFileSync(path.join(root, "VERSION"), "utf8").trim()
);

export const releaseArtifactsPlugin = (root: string): Plugin => {
  let isBuild = false;
  let base = "/";

  return {
    name: "motio-release-artifacts",
    configResolved(config) {
      isBuild = config.command === "build";
      base = config.base;
    },
    buildStart() {
      if (!isBuild) return;
      // Nothing imports this chunk by name, so its exports must be kept on purpose.
      this.emitFile({
        type: "chunk",
        id: path.join(root, RELEASE_NOTES_MODULE),
        name: "releaseNotes",
        preserveSignature: "strict",
      });
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const tags: HtmlTagDescriptor[] = [
          { tag: "meta", attrs: { name: VERSION_META, content: readAppVersion(root) }, injectTo: "head" },
        ];
        const releaseNotesChunk = ctx.bundle && Object.values(ctx.bundle).find((item) => (
          item.type === "chunk" && item.facadeModuleId?.endsWith(RELEASE_NOTES_MODULE)
        ));
        if (releaseNotesChunk) {
          tags.push({
            tag: "meta",
            attrs: { name: RELEASE_NOTES_META, content: `${base}${releaseNotesChunk.fileName}` },
            injectTo: "head",
          });
        }
        return tags;
      },
    },
  };
};
