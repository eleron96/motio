type AbortSignalCapable<T> = T & {
  abortSignal?: (signal: AbortSignal) => T;
};

export type LatestAsyncRequest = {
  next: () => { requestId: number; signal: AbortSignal };
  isCurrent: (requestId: number) => boolean;
  cancel: () => void;
};

export const createLatestAsyncRequest = (): LatestAsyncRequest => {
  let requestId = 0;
  let controller: AbortController | null = null;

  return {
    next: () => {
      requestId += 1;
      controller?.abort();
      controller = new AbortController();
      return { requestId, signal: controller.signal };
    },
    isCurrent: (candidateId) => candidateId === requestId,
    cancel: () => {
      controller?.abort();
      controller = null;
    },
  };
};

export const withAbortSignal = <T>(query: T, signal: AbortSignal): T => {
  const candidate = query as AbortSignalCapable<T>;
  if (typeof candidate.abortSignal === 'function') {
    return candidate.abortSignal(signal);
  }
  return query;
};

export const isAbortError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; message?: string };
  const name = (candidate.name ?? '').toLowerCase();
  const message = (candidate.message ?? '').toLowerCase();
  return name.includes('abort') || message.includes('abort');
};
