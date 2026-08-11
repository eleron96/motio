import { detectBrowserLocale, isSupportedLocale, type Locale } from "@/shared/lib/locale";

/**
 * Bumped from "ui-locale": the old key was written on every boot, including
 * boots where the user never chose anything, so it recorded the historical
 * English default for everybody. Reading that back would keep the browser
 * language permanently ignored. Only a deliberate choice lands in this key —
 * and for signed-in people the profile language restores their choice anyway.
 */
const STORAGE_KEY = "ui-locale.v2";

export const getStoredLocalePreference = (): Locale | null => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isSupportedLocale(stored) ? stored : null;
};

/**
 * The language to show right now: what the user picked before, or — the very
 * first time — whatever their browser is set to.
 */
export const getStoredLocale = (): Locale => {
  return getStoredLocalePreference() ?? detectBrowserLocale();
};

export const setStoredLocale = (locale: Locale) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
};
