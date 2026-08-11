export const SUPPORTED_LOCALES = ["en", "ru"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Used when the browser tells us nothing we understand. */
export const DEFAULT_LOCALE: Locale = "en";

export const isSupportedLocale = (value: unknown): value is Locale =>
  typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);

/**
 * Picks a UI language from a browser language list ("ru-RU", "en-GB", …).
 * Only the primary subtag matters: every Russian region variant maps to `ru`.
 * The first entry we recognise wins — a list is ordered by the user's own
 * preference — and anything unknown falls back to English.
 */
export const resolveLocaleFromLanguages = (
  languages: readonly string[] | undefined | null,
): Locale => {
  for (const language of languages ?? []) {
    if (typeof language !== "string") continue;
    const primary = language.trim().toLowerCase().split(/[-_]/)[0];
    if (isSupportedLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
};

/**
 * The language the browser is set to, as our best guess before the user has
 * ever said anything. `navigator.languages` is the ordered preference list;
 * `navigator.language` is the single-value fallback for older engines.
 */
export const detectBrowserLocale = (): Locale => {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean);
  return resolveLocaleFromLanguages(languages as readonly string[]);
};

export const localeLabels: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};
