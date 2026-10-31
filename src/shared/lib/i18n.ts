import { i18n } from "@lingui/core";
import { messages as enMessages } from "@/locales/en/messages.mjs";
import { messages as ruMessages } from "@/locales/ru/messages.mjs";
import { messages as deMessages } from "@/locales/de/messages.mjs";

// Catalogs are compiled at build time (lingui compile); Lingui installs its
// runtime message compiler by itself only in development.
i18n.load({
  en: enMessages,
  ru: ruMessages,
  de: deMessages,
});

export { i18n };
