import { useEffect } from "react";
import { buildCanonicalUrl } from "@/shared/lib/seo/canonical";

type PageSeoOptions = {
  title: string;
  description?: string;
  robots?: string;
  canonicalPath?: string;
  ogType?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
};

const upsertMetaByName = (name: string, content: string) => {
  const selector = `meta[name="${name}"]`;
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
};

const upsertMetaByProperty = (property: string, content: string) => {
  const selector = `meta[property="${property}"]`;
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
};

const upsertCanonical = (href: string) => {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
};

export const usePageSeo = ({
  title,
  description,
  robots,
  canonicalPath,
  ogType = "website",
  ogImage,
  twitterCard = "summary_large_image",
}: PageSeoOptions) => {
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.title = title;

    if (description) {
      upsertMetaByName("description", description);
      upsertMetaByProperty("og:description", description);
      upsertMetaByName("twitter:description", description);
    }

    if (robots) {
      upsertMetaByName("robots", robots);
    }

    upsertMetaByProperty("og:title", title);
    upsertMetaByProperty("og:type", ogType);
    upsertMetaByName("twitter:title", title);
    upsertMetaByName("twitter:card", twitterCard);

    if (ogImage) {
      upsertMetaByProperty("og:image", ogImage);
      upsertMetaByName("twitter:image", ogImage);
    }

    if (canonicalPath && typeof window !== "undefined") {
      const canonicalUrl = buildCanonicalUrl(window.location.origin, canonicalPath);
      upsertCanonical(canonicalUrl);
      upsertMetaByProperty("og:url", canonicalUrl);
    }
  }, [canonicalPath, description, ogImage, ogType, robots, title, twitterCard]);
};
