import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const readRepoText = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

// Caddy serves only an explicit list of paths without a session; everything else falls
// through to the oauth2-proxy catch-all and becomes a redirect to the sign-in page.
// That is how the Terms page broke for visitors: /privacy was on the list, /terms was
// not. Every public page, and every file a link preview fetches, has to be listed in
// both the production and the testing Caddyfile.
const PUBLIC_HANDLES = [
  "/privacy*",
  "/terms*",
  "/demo*",
  "/invite*",
  "/og-image.png",
  "/logo.png",
  "/robots.txt",
  "/sitemap.xml",
];

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe.each(["infra/caddy/Caddyfile", "infra/caddy/Caddyfile.testing"])("%s", (caddyfile) => {
  const text = readRepoText(caddyfile);

  it.each(PUBLIC_HANDLES)("serves %s without a session", (path) => {
    expect(text).toMatch(new RegExp(`^\\s*handle ${escapeForRegExp(path)} \\{`, "m"));
  });

  it("applies the SPA content security policy to both legal pages", () => {
    const spaMatcher = text.split("\n").find((line) => line.trim().startsWith("@spa path"));
    expect(spaMatcher).toBeDefined();
    expect(spaMatcher).toContain(" /privacy*");
    expect(spaMatcher).toContain(" /terms*");
  });
});

describe("link preview card", () => {
  it("is what index.html points og:image and twitter:image at, and it exists", () => {
    const indexHtml = readRepoText("index.html");
    expect(indexHtml).toContain('<meta property="og:image" content="https://motio.nikog.net/og-image.png" />');
    expect(indexHtml).toContain('<meta name="twitter:image" content="https://motio.nikog.net/og-image.png" />');
    expect(existsSync(resolve(repoRoot, "public/og-image.png"))).toBe(true);
  });

  it("is listed in the sitemap next to the public pages", () => {
    const sitemap = readRepoText("public/sitemap.xml");
    for (const page of ["/", "/demo", "/privacy", "/terms"]) {
      expect(sitemap).toContain(`<loc>https://motio.nikog.net${page}</loc>`);
    }
  });
});
