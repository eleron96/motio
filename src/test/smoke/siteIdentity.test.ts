import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SITE_URL,
  renderIndexHtml,
  renderRobotsTxt,
  renderSitemapXml,
  resolveSiteIdentity,
} from "../../../vite/siteIdentity";

const indexSource = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

// What motio.nikog.net builds with: prod-compose.sh fills these in.
const PUBLIC_SITE_ENV = {
  VITE_PLAUSIBLE_DOMAIN: "motio.nikog.net",
  VITE_PLAUSIBLE_SRC: "https://analise.nikog.webtm.ru/js/script.js",
};

describe("site identity: the public site keeps its pages as they were", () => {
  const identity = resolveSiteIdentity(PUBLIC_SITE_ENV);
  const html = renderIndexHtml(indexSource, identity);

  it("defaults to the public site's address", () => {
    expect(identity.siteUrl).toBe(DEFAULT_SITE_URL);
  });

  it("loads the public site's analytics script", () => {
    expect(html).toContain(
      '    <script defer data-domain="motio.nikog.net" src="https://analise.nikog.webtm.ru/js/script.js"></script>\n  </head>',
    );
  });

  it("leaves no placeholder behind", () => {
    expect(html).not.toContain("__MOTIO_SITE_URL__");
    expect(html).not.toContain("motio:analytics");
  });

  it("renders robots.txt and sitemap.xml with the public address", () => {
    expect(renderRobotsTxt(identity)).toBe(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /app",
        "Disallow: /auth",
        "Disallow: /invite",
        "Disallow: /oauth2",
        "",
        "Sitemap: https://motio.nikog.net/sitemap.xml",
        "",
      ].join("\n"),
    );
    const sitemap = renderSitemapXml(identity);
    expect(sitemap).toContain("<loc>https://motio.nikog.net/</loc>");
    expect(sitemap).toContain("<loc>https://motio.nikog.net/demo</loc>");
  });
});

describe("site identity: a self-hosted build", () => {
  const identity = resolveSiteIdentity({ VITE_PUBLIC_SITE_URL: "https://planner.example.com/" });
  const html = renderIndexHtml(indexSource, identity);

  it("points canonical and link-preview tags at its own domain", () => {
    expect(html).toContain('<link rel="canonical" href="https://planner.example.com/" />');
    expect(html).toContain('content="https://planner.example.com/og-image.png"');
    expect(html).not.toContain("motio.nikog.net/");
  });

  it("sends page views nowhere", () => {
    expect(identity.analytics).toBeNull();
    expect(html).not.toContain("<script defer data-domain");
    expect(html).not.toContain("analise.nikog.webtm.ru");
  });

  it("lists its own address in robots.txt and sitemap.xml", () => {
    expect(renderRobotsTxt(identity)).toContain("Sitemap: https://planner.example.com/sitemap.xml");
    expect(renderSitemapXml(identity)).not.toContain("motio.nikog.net");
  });

  it("escapes analytics values into the script attributes", () => {
    const withAnalytics = renderIndexHtml(
      indexSource,
      resolveSiteIdentity({ VITE_PLAUSIBLE_DOMAIN: 'a"b', VITE_PLAUSIBLE_SRC: "https://stats.example.com/js/script.js" }),
    );
    expect(withAnalytics).toContain('data-domain="a&quot;b"');
  });
});

describe("site identity: misconfiguration fails the build", () => {
  it("rejects a site address that is not an origin", () => {
    expect(() => resolveSiteIdentity({ VITE_PUBLIC_SITE_URL: "planner.example.com" })).toThrow();
    expect(() => resolveSiteIdentity({ VITE_PUBLIC_SITE_URL: "https://example.com/motio" })).toThrow();
    expect(() => resolveSiteIdentity({ VITE_PUBLIC_SITE_URL: "ftp://example.com" })).toThrow();
  });

  it("rejects half of the analytics pair", () => {
    expect(() => resolveSiteIdentity({ VITE_PLAUSIBLE_DOMAIN: "example.com" })).toThrow();
    expect(() => resolveSiteIdentity({ VITE_PLAUSIBLE_SRC: "https://stats.example.com/js/script.js" })).toThrow();
  });
});
