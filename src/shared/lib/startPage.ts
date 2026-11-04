// Where the site root leads. VITE_START_PAGE=app sends `/` straight to the app,
// for an internal install that has no use for the public landing page and its
// demo link. Anything else, including no value, keeps the landing page.
//
// A lasting setting, not a feature flag: it is not meant to be removed.

export const opensAppAtRoot = (value: unknown = import.meta.env.VITE_START_PAGE): boolean => (
  typeof value === 'string' && value.trim().toLowerCase() === 'app'
);

export const MOTIO_SOURCE_URL = 'https://github.com/eleron96/motio';
