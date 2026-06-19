const RECOVERABLE_IMPORT_ERROR_STORAGE_KEY = 'motio:recoverable-import-error';

const RECOVERABLE_IMPORT_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
  // Vite's CSS-preload failure for a lazy chunk whose stylesheet hash was
  // rotated away by a deploy — recoverable, reload picks up the fresh bundle.
  /Unable to preload CSS for/i,
];

type ReloadAttemptStorage = Pick<Storage, 'getItem' | 'setItem'>;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? '');
};

const getRecoverableImportErrorSignature = (error: unknown): string | null => {
  const message = getErrorMessage(error).trim();
  if (!message) {
    return null;
  }

  return RECOVERABLE_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message))
    ? message
    : null;
};

export const isRecoverableImportError = (error: unknown): boolean =>
  getRecoverableImportErrorSignature(error) !== null;

export const reloadCurrentPage = (): void => {
  window.location.reload();
};

export const reloadForRecoverableImportError = (
  error: unknown,
  options: {
    storage?: ReloadAttemptStorage;
    reload?: () => void;
  } = {},
): boolean => {
  const signature = getRecoverableImportErrorSignature(error);
  if (!signature) {
    return false;
  }

  const storage = options.storage ?? window.sessionStorage;

  try {
    if (storage.getItem(RECOVERABLE_IMPORT_ERROR_STORAGE_KEY) === signature) {
      return false;
    }

    storage.setItem(RECOVERABLE_IMPORT_ERROR_STORAGE_KEY, signature);
  } catch {
    return false;
  }

  const reload = options.reload ?? reloadCurrentPage;
  reload();
  return true;
};
