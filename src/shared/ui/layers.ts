/**
 * One scale for every floating layer, plus a runtime stack so a dialog opened
 * from inside a full-screen mobile screen lands *above* that screen instead of
 * underneath it.
 *
 * Why a stack and not fixed numbers: on a phone a whole page can be a
 * full-screen layer (`MobileScreenShell`, `MobileFormScreen`), and everything
 * that page opens — sheets, dialogs, menus — is portalled to `document.body`,
 * i.e. a sibling of the screen rather than a child. Hard-coding the overlays at
 * `z-50` and the screen at `z-60` put every one of those behind an opaque
 * screen: the dialog was mounted and focused (the keyboard even came up) but
 * nothing was visible. That is what broke every «+» on the mobile project card.
 *
 * The model: `--layer-modal` on `<body>` always names the layer that the next
 * overlay should use. A full-screen screen takes the layer above the current
 * one for itself and pushes the variable one step further for its own content,
 * so nesting stays correct at any depth:
 *
 *   no screen open      → screens sit at 60, overlays at 50
 *   one screen open     → that screen at 60, its overlays at 70
 *   screen over screen  → the second at 80, its overlays at 90
 *
 * Consumers use the class constants below rather than the numbers, so the whole
 * scale can move in one place.
 */

/** Layer of an overlay when no full-screen mobile screen is open. */
export const LAYER_BASE = 50;

/** Gap between neighbouring layers. */
export const LAYER_STEP = 10;

/** CSS custom property carrying the layer the next overlay should use. */
export const MODAL_LAYER_VAR = '--layer-modal';

/**
 * Dialogs, sheets, popovers, menus — anything that opens over the page and
 * must clear a full-screen mobile screen when one is open.
 */
export const LAYER_MODAL_CLASS = 'z-[var(--layer-modal)]';

/**
 * One step above the current overlay layer: alert dialogs, which always ask
 * about the thing on top of them and so must never end up beneath it.
 */
export const LAYER_ABOVE_MODAL_CLASS = 'z-[calc(var(--layer-modal)_+_10)]';

interface ScreenLayerEntry {
  own: number;
}

const openScreens: ScreenLayerEntry[] = [];

const nextOverlayLayer = (): number => (
  openScreens.length > 0
    ? openScreens[openScreens.length - 1].own + LAYER_STEP
    : LAYER_BASE
);

const syncVar = (): void => {
  if (typeof document === 'undefined') return;
  const value = nextOverlayLayer();
  if (value === LAYER_BASE) {
    // Back to the base — drop the override so the stylesheet's value applies.
    document.body.style.removeProperty(MODAL_LAYER_VAR);
    return;
  }
  document.body.style.setProperty(MODAL_LAYER_VAR, String(value));
};

/**
 * Claim the layer above the current overlay layer for a full-screen screen and
 * raise `--layer-modal` for whatever that screen opens. Call `release` when the
 * screen closes; releases may arrive out of order, so entries are removed by
 * identity rather than popped.
 */
export const pushScreenLayer = (): { own: number; release: () => void } => {
  const entry: ScreenLayerEntry = { own: nextOverlayLayer() + LAYER_STEP };
  openScreens.push(entry);
  syncVar();
  return {
    own: entry.own,
    release: () => {
      const index = openScreens.indexOf(entry);
      if (index === -1) return;
      openScreens.splice(index, 1);
      syncVar();
    },
  };
};

/** Test seam: forget every open screen. */
export const resetScreenLayers = (): void => {
  openScreens.length = 0;
  syncVar();
};
