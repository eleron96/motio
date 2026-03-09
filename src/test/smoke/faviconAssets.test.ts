import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(...segments: string[]) {
  return readFileSync(resolve(repoRoot, ...segments));
}

function readRepoText(...segments: string[]) {
  return readRepoFile(...segments).toString("utf8");
}

describe("brand asset routing", () => {
  it("advertises the current favicon set from the public app shell", () => {
    const indexHtml = readRepoText("index.html");

    expect(indexHtml).toContain('rel="icon" href="/favicon.ico" sizes="any"');
    expect(indexHtml).toContain('rel="icon" type="image/png" href="/favicon.png"');
    expect(indexHtml).toContain('rel="icon" type="image/png" href="/favicon_new.png"');
    expect(indexHtml).toContain('rel="shortcut icon" href="/favicon.ico"');
    expect(indexHtml).toContain('rel="apple-touch-icon" href="/logo.png"');
    expect(indexHtml).toContain('property="og:image" content="https://motio.nikog.net/logo.png"');
    expect(indexHtml).toContain('name="twitter:image" content="https://motio.nikog.net/logo.png"');
  });

  it("keeps public and login favicon assets in sync", () => {
    const caddyFile = readRepoText("infra", "caddy", "Caddyfile");
    const publicPng = readRepoFile("public", "favicon.png");
    const newPng = readRepoFile("public", "favicon_new.png");
    const publicIco = readRepoFile("public", "favicon.ico");
    const keycloakIco = readRepoFile(
      "infra",
      "keycloak",
      "themes",
      "timeline",
      "login",
      "resources",
      "img",
      "favicon.ico",
    );

    expect(caddyFile).toContain("handle /favicon* {");
    expect(caddyFile).toContain("handle /logo.png {");
    expect(publicPng.equals(newPng)).toBe(true);
    expect(publicIco.equals(keycloakIco)).toBe(true);
    expect(existsSync(resolve(repoRoot, "public", "logo.png"))).toBe(true);
  });
});
