import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Safe wrappers around `React.lazy` for code-split components.
 *
 * Why this exists:
 * Vite's `__vitePreload` helper does NOT always reject when a dynamic chunk
 * fails to load. When the `vite:preloadError` event is dispatched and any
 * listener calls `preventDefault()`, Vite swallows the failure and the
 * `import()` promise resolves to `undefined` instead of rejecting. The call
 * sites then do `module.SomeExport` / read `.default` on `undefined`, throwing
 * a generic `TypeError: Cannot read properties of undefined (reading 'X')`.
 *
 * That generic TypeError does not match any of our "Failed to fetch
 * dynamically imported module" filters, so it escapes the auto-reload + the
 * Sentry/Glitchtip drop list and shows up as a real error.
 *
 * These wrappers detect the `undefined` module (or a missing export) and throw
 * a message that IS recognised as a recoverable stale-chunk failure, so the
 * existing error boundary reloads the page and keeps the noise out of
 * Glitchtip. See `recoverableImportError`, `preloadErrorReload` and `sentry`.
 */

/** Prefix recognised by every "recoverable import error" classifier. */
const RECOVERABLE_IMPORT_MESSAGE = 'Failed to fetch dynamically imported module';

export const makeRecoverableImportError = (source: string): Error =>
  new Error(`${RECOVERABLE_IMPORT_MESSAGE}: ${source}`);

/**
 * `React.lazy` for a module whose component is the default export.
 * `label` is only used to tag the recoverable error (debugging + reload guard).
 * The component's prop types are preserved.
 */
export function lazyDefault<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  label: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const module = await importer();
    if (module == null || module.default == null) {
      throw makeRecoverableImportError(label);
    }
    return module;
  });
}

/**
 * `React.lazy` for a module that exports the component under a named export.
 * `name` doubles as the recoverable-error tag. The named export's prop types
 * are preserved at the call site.
 */
export function lazyNamed<M, K extends keyof M & string>(
  importer: () => Promise<M>,
  name: K,
): LazyExoticComponent<M[K] extends ComponentType<any> ? M[K] : never> {
  return lazy(async () => {
    const module = (await importer()) as M | undefined;
    const Component = module == null ? undefined : module[name];
    if (Component == null) {
      throw makeRecoverableImportError(name);
    }
    return { default: Component as ComponentType<any> };
  }) as LazyExoticComponent<M[K] extends ComponentType<any> ? M[K] : never>;
}
