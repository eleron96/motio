import type React from 'react';

/** A picture to show in `ImageLightbox`. */
export interface LightboxImage {
  src: string;
  alt?: string;
}

/**
 * The picture a plain left click landed on, if any — for rich text where any
 * <img> should open in the lightbox. A modified click (Shift extends a text
 * selection, Ctrl/Cmd opens menus) is left alone.
 */
export const getClickedLightboxImage = (event: React.MouseEvent): LightboxImage | null => {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !target.src) return null;
  return { src: target.src, alt: target.alt };
};
