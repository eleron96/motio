import { useLayoutEffect, useState } from 'react';
import { LAYER_BASE, LAYER_STEP, pushScreenLayer } from '@/shared/ui/layers';

/**
 * Give a full-screen mobile screen its own z-index and raise `--layer-modal`
 * for everything it opens, for as long as it is open.
 *
 * Layout effect, not effect: the layer has to be in place before the browser
 * paints the screen, otherwise the first frame lands at the fallback depth.
 */
export const useScreenLayer = (open: boolean): number => {
  const [layer, setLayer] = useState(LAYER_BASE + LAYER_STEP);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const entry = pushScreenLayer();
    setLayer(entry.own);
    return entry.release;
  }, [open]);

  return layer;
};
