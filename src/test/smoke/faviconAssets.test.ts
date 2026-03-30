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
  it("advertises light and dark favicons from the public app shell", () => {
    const indexHtml = readRepoText("index.html");

    expect(indexHtml).toContain('href="/favicon-theme-light.png"');
    expect(indexHtml).toContain('href="/favicon-theme-dark.png"');
    expect(indexHtml).toContain('media="(prefers-color-scheme: light)"');
    expect(indexHtml).toContain('media="(prefers-color-scheme: dark)"');
    expect(indexHtml).toContain('data-theme-favicon="active"');
    expect(indexHtml).toContain('data-theme-favicon="shortcut"');
    expect(indexHtml).toContain('rel="apple-touch-icon" href="/logo.png"');
    expect(indexHtml).toContain('link rel="canonical" href="/"');
    expect(indexHtml).toContain('property="og:url" content="/"');
    expect(indexHtml).toContain('property="og:image" content="/logo.png"');
    expect(indexHtml).toContain('name="twitter:image" content="/logo.png"');
  });

  it("keeps public and login theme favicon assets in sync", () => {
    const caddyFile = readRepoText("infra", "caddy", "Caddyfile");
    const loginTemplate = readRepoText(
      "infra",
      "keycloak",
      "themes",
      "timeline",
      "login",
      "template.ftl",
    );
    const publicLight = readRepoFile("public", "favicon-theme-light.png");
    const publicDark = readRepoFile("public", "favicon-theme-dark.png");
    const keycloakLight = readRepoFile(
      "infra",
      "keycloak",
      "themes",
      "timeline",
      "login",
      "resources",
      "img",
      "favicon-theme-light.png",
    );
    const keycloakDark = readRepoFile(
      "infra",
      "keycloak",
      "themes",
      "timeline",
      "login",
      "resources",
      "img",
      "favicon-theme-dark.png",
    );
    const loginScript = readRepoText(
      "infra",
      "keycloak",
      "themes",
      "timeline",
      "login",
      "resources",
      "js",
      "login.v4.js",
    );

    expect(caddyFile).toContain("handle /favicon* {");
    expect(caddyFile).toContain("handle /logo.png {");
    expect(loginTemplate).toContain('href="${url.resourcesPath}/img/favicon-theme-light.png"');
    expect(loginTemplate).toContain('href="${url.resourcesPath}/img/favicon-theme-dark.png"');
    expect(loginTemplate).toContain('media="(prefers-color-scheme: light)"');
    expect(loginTemplate).toContain('media="(prefers-color-scheme: dark)"');
    expect(loginTemplate).not.toContain('href="${url.resourcesPath}/img/favicon.ico"');
    expect(publicLight.equals(keycloakLight)).toBe(true);
    expect(publicDark.equals(keycloakDark)).toBe(true);
    expect(loginScript).toContain("favicon-theme-light.png");
    expect(loginScript).toContain("favicon-theme-dark.png");
    expect(existsSync(resolve(repoRoot, "public", "logo.png"))).toBe(true);
  });
});
