import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuPosition = { x: number; y: number };

/**
 * The right-click menu of a picture in the rich-text editor. Positions are
 * relative to the editor's container; the menu closes on an outside press,
 * any scroll or Escape, and moves itself back inside the container.
 */
export const useRichTextImageMenu = (containerRef: RefObject<HTMLDivElement>) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const close = useCallback(() => {
    setPosition(null);
    imageRef.current = null;
  }, []);

  const openAt = useCallback((image: HTMLImageElement, clientX: number, clientY: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = containerRect ? clientX - containerRect.left + 6 : clientX + 6;
    const y = containerRect ? clientY - containerRect.top + 6 : clientY + 6;
    imageRef.current = image;
    setPosition({ x, y });
  }, [containerRef]);

  useEffect(() => {
    if (!position) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.rte-image-menu')) return;
      close();
    };
    const handleScroll = () => close();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, position]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!position || !menuRef.current || !container) return;
    const rect = menuRef.current.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const padding = 8;
    let nextX = position.x;
    let nextY = position.y;
    const maxX = containerRect.width - rect.width - padding;
    const maxY = containerRect.height - rect.height - padding;
    if (nextX > maxX) {
      nextX = Math.max(padding, maxX);
    }
    if (nextY > maxY) {
      nextY = Math.max(padding, maxY);
    }
    if (nextX < padding) nextX = padding;
    if (nextY < padding) nextY = padding;
    if (nextX !== position.x || nextY !== position.y) {
      setPosition({ x: nextX, y: nextY });
    }
  }, [containerRef, position]);

  return { menuRef, imageRef, position, openAt, close };
};
