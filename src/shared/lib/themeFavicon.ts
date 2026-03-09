const browserThemeQuery = "(prefers-color-scheme: dark)";

function upsertFaviconLink(
  rel: string,
  href: string,
  marker: string,
  type?: string,
) {
  let link = document.querySelector<HTMLLinkElement>(`link[data-theme-favicon="${marker}"]`);
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("data-theme-favicon", marker);
    document.head.appendChild(link);
  }

  link.rel = rel;
  link.href = href;

  if (type) {
    link.type = type;
  } else {
    link.removeAttribute("type");
  }
}

export function syncBrowserThemeFavicons() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const mediaQuery = window.matchMedia(browserThemeQuery);

  const apply = () => {
    const href = mediaQuery.matches ? "/favicon-theme-dark.png" : "/favicon-theme-light.png";

    upsertFaviconLink("icon", href, "active", "image/png");
    upsertFaviconLink("shortcut icon", href, "shortcut");
  };

  apply();

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", apply);
    return;
  }

  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(apply);
  }
}
