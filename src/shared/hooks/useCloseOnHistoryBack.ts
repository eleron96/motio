import { useEffect, useRef } from 'react';

const HISTORY_MARKER_KEY = '__motioOverlay';

const readMarker = (): unknown => {
  const state = window.history.state as Record<string, unknown> | null;
  return state && typeof state === 'object' ? state[HISTORY_MARKER_KEY] : undefined;
};

let markerSequence = 0;

/**
 * Lets the browser's Back — the button, Android's back key, the iOS edge swipe —
 * close an overlay instead of leaving the page underneath it.
 *
 * While `open`, the overlay owns one extra history entry (same URL, the
 * router's own state kept as is). Back pops that entry and `onClose` runs;
 * closing any other way (a button, Escape, a click outside) pops the entry
 * itself, so history ends up exactly where it was before the overlay opened.
 */
export const useCloseOnHistoryBack = (open: boolean, onClose: () => void): void => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;

    markerSequence += 1;
    const marker = `overlay-${markerSequence}`;
    const currentState = window.history.state as Record<string, unknown> | null;
    window.history.pushState(
      { ...(currentState && typeof currentState === 'object' ? currentState : {}), [HISTORY_MARKER_KEY]: marker },
      '',
    );

    let poppedByBrowser = false;
    const handlePopState = () => {
      if (readMarker() === marker) return;
      poppedByBrowser = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Closed from inside: drop the entry we added, but only if it is still
      // the current one — never step back past someone else's navigation.
      if (!poppedByBrowser && readMarker() === marker) window.history.back();
    };
  }, [open]);
};
