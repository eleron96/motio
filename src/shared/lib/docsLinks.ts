import type { Locale } from '@/shared/lib/locale';

// Motio's documentation site: docs-site/ in the repository, published from main to
// GitHub Pages. It has an English and a Russian version; German readers get English.
// Like the source code link, it points at the project itself, so it is the same on
// every install, own servers included.
export const MOTIO_DOCS_URL = 'https://eleron96.github.io/motio/';

const docsRoot = (locale: Locale) => (locale === 'ru' ? `${MOTIO_DOCS_URL}ru/` : MOTIO_DOCS_URL);

/** The documentation's home page, in the interface language where it exists. */
export const docsHomeUrl = (locale: Locale): string => docsRoot(locale);

/** How to work in Motio: the user guide. */
export const userGuideUrl = (locale: Locale): string => `${docsRoot(locale)}guide/`;

/** How to run Motio on your own server (English text; Russian site chrome). */
export const selfHostingGuideUrl = (locale: Locale): string => `${docsRoot(locale)}self-hosting/`;
