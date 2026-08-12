import { create } from "zustand";
import { i18n } from "@/shared/lib/i18n";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/shared/lib/locale";
import { getStoredLocale, setStoredLocale } from "@/shared/lib/localeStorage";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setLocaleFromProfile: (locale: unknown) => void;
}

/** Shows the language without claiming the user picked it. */
const activateLocale = (locale: Locale) => {
  i18n.activate(locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
};

/** Shows the language AND records it as the user's own choice. */
const applyLocale = (locale: Locale) => {
  activateLocale(locale);
  setStoredLocale(locale);
};

const resolveInitialLocale = () => getStoredLocale() ?? DEFAULT_LOCALE;

const initialLocale = resolveInitialLocale();
// Стартовая локаль может быть просто догадкой по браузеру — записывать её как
// выбор нельзя, иначе догадка навсегда подменит собой реальные предпочтения.
activateLocale(initialLocale);

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    if (get().locale === locale) return;
    applyLocale(locale);
    set({ locale });
  },
  setLocaleFromProfile: (value) => {
    const next = isSupportedLocale(value) ? value : resolveInitialLocale();
    if (get().locale === next) return;
    applyLocale(next);
    set({ locale: next });
  },
}));
