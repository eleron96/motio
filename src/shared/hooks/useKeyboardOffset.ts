import { useEffect, useState } from 'react';

interface KeyboardState {
  /**
   * Pixels of viewport currently obscured by the on-screen keyboard. Zero
   * when the keyboard is closed (or on platforms that resize the layout
   * viewport themselves, like Android Chrome by default).
   */
  offset: number;
  /**
   * Current visual viewport height — useful for clamping bottom-sheet
   * `max-height` so the sheet doesn't extend behind the keyboard.
   */
  height: number;
}

/**
 * Track how much of the layout viewport is currently hidden by the on-screen
 * keyboard, using the Visual Viewport API.
 *
 * Why this exists: on iOS Safari (and a few Android keyboards), opening the
 * keyboard does NOT resize the layout viewport — `position: fixed` elements
 * stay anchored to the bottom of the layout viewport, which means the bottom
 * portion of any bottom-sheet sits behind the keyboard. Lifting the sheet by
 * `offset` pixels keeps the action buttons (and the focused input) visible.
 *
 * Usage:
 *   const { offset, height } = useKeyboardOffset();
 *   <SheetContent
 *     style={{ bottom: offset, maxHeight: height }}
 *     className="overflow-y-auto"
 *   />
 */
export const useKeyboardOffset = (): KeyboardState => {
  const [state, setState] = useState<KeyboardState>(() => ({
    offset: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // `innerHeight - vv.height - vv.offsetTop` matches the keyboard height
      // on platforms where the layout viewport does not shrink. On platforms
      // that do shrink (Android Chrome by default), `innerHeight` already
      // tracks `vv.height`, so the subtraction lands at 0.
      const obscured = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setState({ offset: obscured, height: vv.height });
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // Some browsers fire `resize` only after the keyboard finishes its
    // animation; re-checking on focus changes catches the early frames.
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, []);

  return state;
};
