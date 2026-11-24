import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// The maintenance page (docs/operations.md, "Maintenance page") lives inside the
// Caddyfiles: production, testing and self-hosted. They must carry the same page
// and check for it before anything is sent to the services.

const CADDYFILES = ["infra/caddy/Caddyfile", "infra/caddy/Caddyfile.testing", "infra/caddy/Caddyfile.selfhost"];
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const snippetOf = (text: string) => {
  const start = text.indexOf("(maintenance) {");
  const end = text.indexOf("\n}\n", start);
  return start < 0 || end < 0 ? "" : text.slice(start, end + 3);
};

describe("maintenance page", () => {
  const snippets = CADDYFILES.map((path) => snippetOf(read(path)));

  it("is the same in every Caddyfile", () => {
    expect(snippets[0]).not.toBe("");
    expect(snippets[1]).toBe(snippets[0]);
    expect(snippets[2]).toBe(snippets[0]);
  });

  it("answers 503 with Retry-After and is switched by a file in Caddy's data volume", () => {
    const snippet = snippets[0];
    expect(snippet).toContain("root /data");
    expect(snippet).toContain("try_files /motio-maintenance");
    expect(snippet).toContain('header Retry-After "120"');
    expect(snippet).toMatch(/HTML 503\n/);
  });

  it("speaks English, Russian and German", () => {
    const snippet = snippets[0];
    expect(snippet).toContain("Motio is being updated");
    expect(snippet).toContain("Обновляем Motio");
    expect(snippet).toContain("Motio wird aktualisiert");
  });

  // `respond` treats {…} as a placeholder and would cut a stylesheet block out.
  it("has no curly braces inside the page", () => {
    const page = snippets[0].slice(snippets[0].indexOf("<<HTML"), snippets[0].indexOf("HTML 503"));
    expect(page).not.toMatch(/[{}]/);
  });

  it.each(CADDYFILES)("%s checks for it before any route", (path) => {
    const text = read(path);
    const route = text.slice(text.indexOf("\n  route {"));
    const importAt = route.indexOf("import maintenance");
    const firstHandle = route.search(/\n\s+(handle|redir|reverse_proxy) /);
    expect(importAt).toBeGreaterThan(0);
    expect(importAt).toBeLessThan(firstHandle);
  });

  it("is switched with the same file by the owner's script", () => {
    expect(read("infra/scripts/maintenance.sh")).toContain('flag="/data/motio-maintenance"');
  });
});
