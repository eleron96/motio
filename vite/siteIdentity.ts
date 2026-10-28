import type { Plugin } from "vite";

/**
 * Where this build of Motio lives and whether it reports page views anywhere.
 *
 * The public site (motio.nikog.net) and every self-hosted install are built from
 * the same sources. Everything that names the site's own address — canonical
 * and social tags in index.html, robots.txt, sitemap.xml — comes from here, so a
 * self-hosted build points at its own domain. Analytics is opt-in: without both
 * Plausible variables a build sends page views nowhere.
 */
export interface SiteIdentity {
  /** Absolute origin without a trailing slash, e.g. https://planner.example.com */
  siteUrl: string;
  analytics: { domain: string; scriptSrc: string } | null;
}

/** Kept as the default so a build without VITE_PUBLIC_SITE_URL stays exactly as before. */
export const DEFAULT_SITE_URL = "https://motio.nikog.net";

const SITE_URL_PLACEHOLDER = "__MOTIO_SITE_URL__";
const ANALYTICS_MARKER = "<!-- motio:analytics -->";

/** Public pages listed in sitemap.xml. Must stay public in every Caddyfile. */
const SITEMAP_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/demo", changefreq: "weekly", priority: "0.8" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

const escapeHtmlAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const normalizeSiteUrl = (raw: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`VITE_PUBLIC_SITE_URL must be an absolute URL, got "${raw}"`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`VITE_PUBLIC_SITE_URL must use http or https, got "${raw}"`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`VITE_PUBLIC_SITE_URL must be an origin without a path, got "${raw}"`);
  }
  return parsed.origin;
};

export const resolveSiteIdentity = (env: Record<string, string | undefined>): SiteIdentity => {
  const rawSiteUrl = env.VITE_PUBLIC_SITE_URL?.trim();
  const domain = env.VITE_PLAUSIBLE_DOMAIN?.trim() ?? "";
  const scriptSrc = env.VITE_PLAUSIBLE_SRC?.trim() ?? "";

  if (Boolean(domain) !== Boolean(scriptSrc)) {
    throw new Error("Set both VITE_PLAUSIBLE_DOMAIN and VITE_PLAUSIBLE_SRC, or neither");
  }

  return {
    siteUrl: rawSiteUrl ? normalizeSiteUrl(rawSiteUrl) : DEFAULT_SITE_URL,
    analytics: domain ? { domain, scriptSrc } : null,
  };
};

export const renderIndexHtml = (html: string, identity: SiteIdentity): string => {
  const withSiteUrl = html.split(SITE_URL_PLACEHOLDER).join(identity.siteUrl);
  if (identity.analytics) {
    const { domain, scriptSrc } = identity.analytics;
    const script =
      `<script defer data-domain="${escapeHtmlAttribute(domain)}" ` +
      `src="${escapeHtmlAttribute(scriptSrc)}"></script>`;
    return withSiteUrl.replace(ANALYTICS_MARKER, script);
  }
  // No analytics: drop the marker together with its own line.
  return withSiteUrl.replace(new RegExp(`[ \\t]*${ANALYTICS_MARKER}\\r?\\n?`), "");
};

export const renderRobotsTxt = ({ siteUrl }: SiteIdentity): string =>
  [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app",
    "Disallow: /auth",
    "Disallow: /invite",
    "Disallow: /oauth2",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");

export const renderSitemapXml = ({ siteUrl }: SiteIdentity): string => {
  const urls = SITEMAP_PAGES.map(
    ({ path, changefreq, priority }) =>
      [
        "  <url>",
        `    <loc>${siteUrl}${path === "/" ? "/" : path}</loc>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
};

/** Fills index.html and emits robots.txt / sitemap.xml for this build's site. */
export const siteIdentityPlugin = (identity: SiteIdentity): Plugin => ({
  name: "motio-site-identity",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => renderIndexHtml(html, identity),
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/robots.txt") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(renderRobotsTxt(identity));
        return;
      }
      if (req.url === "/sitemap.xml") {
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.end(renderSitemapXml(identity));
        return;
      }
      next();
    });
  },
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "robots.txt", source: renderRobotsTxt(identity) });
    this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemapXml(identity) });
  },
});
