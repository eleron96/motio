import { describe, expect, it } from "vitest";
import { buildCanonicalUrl, normalizeCanonicalPath } from "@/shared/lib/seo/canonical";

describe("canonical urls", () => {
  it("normalizes relative paths", () => {
    expect(normalizeCanonicalPath("app")).toBe("/app");
    expect(normalizeCanonicalPath("/app/")).toBe("/app");
    expect(normalizeCanonicalPath("")).toBe("/");
  });

  it("passes through absolute urls", () => {
    expect(normalizeCanonicalPath("https://example.com/page")).toBe("https://example.com/page");
  });

  it("builds canonical urls from origin and path", () => {
    expect(buildCanonicalUrl("https://motio.nikog.net/", "/app/")).toBe("https://motio.nikog.net/app");
    expect(buildCanonicalUrl("https://motio.nikog.net", "pricing")).toBe("https://motio.nikog.net/pricing");
    expect(buildCanonicalUrl("", "/")).toBe("/");
  });
});
