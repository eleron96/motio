import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { useScreenLayer } from '@/shared/hooks/useScreenLayer';
import { useCloseOnHistoryBack } from '@/shared/hooks/useCloseOnHistoryBack';
import type { LightboxImage } from '@/shared/lib/lightboxImage';
import {
  DOUBLE_TAP_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  PinchStart,
  Point,
  RESTING_ZOOM,
  Size,
  ZOOM_STEP,
  ZoomState,
  clampOffset,
  isZoomed,
  pinchZoom,
  wheelZoomFactor,
  zoomAt,
} from '@/shared/lib/imageZoom';

interface ImageLightboxProps {
  /** The picture to show; `null` keeps the lightbox closed. */
  image: LightboxImage | null;
  onClose: () => void;
}

/** Finger travel after which a press is a drag, not a tap. */
const TAP_SLOP_PX = 6;
/** Two taps closer than this (in time and space) are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;

const distanceBetween = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpointOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Full-screen picture viewer: wheel, +/− buttons, a pinch or a double tap
 * zoom; a drag moves a zoomed picture. A click beside the picture, Escape, the
 * cross and the browser's Back all close it — and only it: it is a dialog of
 * its own above whatever opened it, so the task card underneath stays open.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ image, onClose }) => {
  const open = image !== null;
  // Keep showing the last picture while the closing animation plays.
  const [shown, setShown] = React.useState<LightboxImage | null>(image);
  if (image && (image.src !== shown?.src || image.alt !== shown?.alt)) setShown(image);

  const layer = useScreenLayer(open);
  useCloseOnHistoryBack(open, onClose);

  const [zoom, setZoom] = React.useState<ZoomState>(RESTING_ZOOM);
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;

  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  // The stage mounts with the portal, a render after `open` flips — so the
  // wheel listener below waits for the node itself, not for `open`.
  const [stageNode, setStageNode] = React.useState<HTMLDivElement | null>(null);
  const setStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    setStageNode(node);
  }, []);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  const pointersRef = React.useRef(new Map<number, Point>());
  const panStartRef = React.useRef<{ pointer: Point; state: ZoomState } | null>(null);
  const pinchStartRef = React.useRef<PinchStart | null>(null);
  const downTargetRef = React.useRef<EventTarget | null>(null);
  const downPointRef = React.useRef<Point | null>(null);
  const movedRef = React.useRef(false);
  const lastTapRef = React.useRef<{ time: number; point: Point } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setZoom(RESTING_ZOOM);
    pointersRef.current.clear();
    panStartRef.current = null;
    pinchStartRef.current = null;
    lastTapRef.current = null;
  }, [open, shown?.src]);

  const measure = React.useCallback((): { viewport: Size; base: Size } | null => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return null;
    return {
      viewport: { width: stage.clientWidth, height: stage.clientHeight },
      // offsetWidth ignores the CSS transform: this is the fitted size.
      base: { width: img.offsetWidth, height: img.offsetHeight },
    };
  }, []);

  /** Pointer position relative to the stage centre — the zoom math's origin. */
  const toStagePoint = React.useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }, []);

  /**
   * Multiplies the current scale. Applied to the latest state, not the last
   * rendered one: a trackpad fires several wheel events within one frame.
   */
  const zoomBy = React.useCallback((factor: number, focus: Point = { x: 0, y: 0 }) => {
    const sizes = measure();
    if (!sizes) return;
    setZoom((current) => zoomAt(current, current.scale * factor, focus, sizes.viewport, sizes.base));
  }, [measure]);

  const zoomTo = React.useCallback((nextScale: number, focus: Point = { x: 0, y: 0 }) => {
    const sizes = measure();
    if (!sizes) return;
    setZoom((current) => zoomAt(current, nextScale, focus, sizes.viewport, sizes.base));
  }, [measure]);

  const zoomIn = () => zoomBy(ZOOM_STEP);
  const zoomOut = () => zoomBy(1 / ZOOM_STEP);
  const resetZoom = () => setZoom(RESTING_ZOOM);

  // Wheel and trackpad pinch (a wheel event with ctrlKey) zoom around the
  // cursor. A native listener: React's wheel handler is passive, and without
  // preventDefault the page behind would scroll or the browser would zoom.
  React.useEffect(() => {
    const stage = stageNode;
    if (!stage) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const focus = toStagePoint(event.clientX, event.clientY);
      zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode), focus);
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [stageNode, toStagePoint, zoomBy]);

  // A window resize or a phone rotation changes the room the picture has.
  React.useEffect(() => {
    if (!open) return undefined;
    const handleResize = () => {
      const sizes = measure();
      if (!sizes) return;
      setZoom((current) => clampOffset(current, sizes.viewport, sizes.base));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measure, open]);

  const beginGesture = () => {
    const points = Array.from(pointersRef.current.values());
    panStartRef.current = null;
    pinchStartRef.current = null;
    if (points.length >= 2) {
      pinchStartRef.current = {
        state: zoomRef.current,
        distance: distanceBetween(points[0], points[1]),
        midpoint: midpointOf(points[0], points[1]),
      };
    } else if (points.length === 1) {
      panStartRef.current = { pointer: points[0], state: zoomRef.current };
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest?.('button')) return;
    const point = toStagePoint(event.clientX, event.clientY);
    if (pointersRef.current.size === 0) {
      downTargetRef.current = event.target;
      downPointRef.current = point;
      movedRef.current = false;
    }
    pointersRef.current.set(event.pointerId, point);
    try {
      // Keeps a drag going when the finger leaves the stage.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Not an active pointer (a synthetic event): the gesture works without.
    }
    if (pointersRef.current.size > 1) movedRef.current = true;
    beginGesture();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = toStagePoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, point);
    const downPoint = downPointRef.current;
    if (downPoint && distanceBetween(point, downPoint) > TAP_SLOP_PX) movedRef.current = true;

    const sizes = measure();
    if (!sizes) return;
    const points = Array.from(pointersRef.current.values());
    const pinchStart = pinchStartRef.current;
    if (pinchStart && points.length >= 2) {
      setZoom(pinchZoom(
        pinchStart,
        distanceBetween(points[0], points[1]),
        midpointOf(points[0], points[1]),
        sizes.viewport,
        sizes.base,
      ));
      return;
    }
    const panStart = panStartRef.current;
    if (panStart && isZoomed(panStart.state)) {
      setZoom(clampOffset({
        scale: panStart.state.scale,
        x: panStart.state.x + (point.x - panStart.pointer.x),
        y: panStart.state.y + (point.y - panStart.pointer.y),
      }, sizes.viewport, sizes.base));
    }
  };

  const handleTap = (point: Point) => {
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && distanceBetween(point, lastTap.point) < DOUBLE_TAP_SLOP_PX) {
      lastTapRef.current = null;
      if (isZoomed(zoomRef.current)) resetZoom();
      else zoomTo(DOUBLE_TAP_ZOOM, point);
      return;
    }
    lastTapRef.current = { time: now, point };
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size > 0) {
      // One finger of a pinch lifted: the other one carries on as a pan.
      beginGesture();
      return;
    }
    panStartRef.current = null;
    pinchStartRef.current = null;
    if (event.type === 'pointerup' && !movedRef.current && downTargetRef.current === imgRef.current) {
      handleTap(toStagePoint(event.clientX, event.clientY));
    }
  };

  // Closing on click rather than on pointerup: the click is the last event of
  // the press, so nothing is left to land on the card underneath.
  const handleStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (movedRef.current) return;
    if (downTargetRef.current !== event.currentTarget) return;
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomOut();
    } else if (event.key === '0') {
      event.preventDefault();
      resetZoom();
    }
  };

  const zoomed = isZoomed(zoom);
  const controlClass = 'grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-40 disabled:hover:bg-black/50';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{ zIndex: layer }}
          className="fixed inset-0 bg-black/90 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          data-testid="image-lightbox"
          style={{ zIndex: layer }}
          className="fixed inset-0 flex outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          onOpenAutoFocus={(event) => {
            // Focus the viewer itself, not its first button: no ring on open,
            // and +/−/0 work from the keyboard straight away.
            event.preventDefault();
            contentRef.current?.focus();
          }}
          // Don't hand focus back to the description: on a phone that would
          // bring the keyboard up over the task the moment the picture closes.
          onCloseAutoFocus={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">
            {shown?.alt?.trim() || t`Image`}
          </DialogPrimitive.Title>
          <div
            ref={setStage}
            className={cn(
              'relative flex-1 touch-none select-none overflow-hidden',
              zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-out',
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onClick={handleStageClick}
          >
            {shown && (
              <img
                ref={imgRef}
                src={shown.src}
                alt={shown.alt ?? ''}
                draggable={false}
                onLoad={() => {
                  const sizes = measure();
                  if (sizes) setZoom((current) => clampOffset(current, sizes.viewport, sizes.base));
                }}
                className={cn(
                  'absolute left-1/2 top-1/2 max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] select-none object-contain',
                  !zoomed && 'cursor-zoom-in',
                )}
                style={{
                  transform: `translate(-50%, -50%) translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                  // Gestures follow the finger; only button and double-tap
                  // jumps ease in.
                  transition: pointersRef.current.size > 0 ? 'none' : 'transform 120ms ease-out',
                  willChange: 'transform',
                }}
              />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-2 p-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
            <div className="pointer-events-auto flex gap-2">
              <button
                type="button"
                className={controlClass}
                onClick={zoomOut}
                disabled={zoom.scale <= MIN_ZOOM}
                aria-label={t`Zoom out`}
                title={t`Zoom out`}
              >
                <ZoomOut className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={controlClass}
                onClick={zoomIn}
                disabled={zoom.scale >= MAX_ZOOM}
                aria-label={t`Zoom in`}
                title={t`Zoom in`}
              >
                <ZoomIn className="h-5 w-5" aria-hidden="true" />
              </button>
              <DialogPrimitive.Close className={controlClass} aria-label={t`Close`} title={t`Close`}>
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
