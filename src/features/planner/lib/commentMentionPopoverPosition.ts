interface RectLike {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface Size {
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

/** Where the visible band starts, in the same client coordinates as `anchorRect`. */
interface ViewportOrigin {
  top: number;
  left: number;
}

export interface CommentMentionPopoverPositionParams {
  anchorRect: RectLike;
  popoverSize: Size;
  viewportSize: ViewportSize;
  /**
   * Top-left of the *visible* area. Defaults to (0, 0), which is right on a
   * desktop; on a phone with the keyboard up the visible band starts at
   * `visualViewport.offsetTop` and is `visualViewport.height` tall, and passing
   * that here is what keeps the popover out from under the keyboard.
   */
  viewportOrigin?: ViewportOrigin;
  offset?: number;
  padding?: number;
}

export interface CommentMentionPopoverPosition {
  top: number;
  left: number;
  placement: 'above' | 'below';
  /** Room on the chosen side — cap the list with it so it crops instead of hiding. */
  maxHeight: number;
}

const DEFAULT_OFFSET = 4;
const DEFAULT_PADDING = 8;
/** Below this a list of names stops being a list, so never shrink past it. */
const MIN_HEIGHT = 120;

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
);

export const getCommentMentionPopoverPosition = ({
  anchorRect,
  popoverSize,
  viewportSize,
  viewportOrigin,
  offset = DEFAULT_OFFSET,
  padding = DEFAULT_PADDING,
}: CommentMentionPopoverPositionParams): CommentMentionPopoverPosition => {
  const originTop = viewportOrigin?.top ?? 0;
  const originLeft = viewportOrigin?.left ?? 0;
  const width = Math.max(0, popoverSize.width);
  const height = Math.max(0, popoverSize.height);
  const minLeft = originLeft + padding;
  const maxLeft = Math.max(minLeft, originLeft + viewportSize.width - width - padding);
  const availableAbove = anchorRect.top - originTop - padding - offset;
  const availableBelow = (originTop + viewportSize.height) - anchorRect.bottom - padding - offset;
  // Which side to take is a question about the natural height: does the list, as
  // it wants to be, fit below?
  const placement = availableBelow < height && availableAbove > availableBelow
    ? 'above'
    : 'below';
  const maxHeight = Math.max(MIN_HEIGHT, placement === 'above' ? availableAbove : availableBelow);
  // Where to put it is a question about the height it will actually render at.
  // Clamping a cropped popover as if it were full height drags it up over the
  // caret — hiding the very word being typed — and leaves the room it gave up
  // sitting empty below.
  const renderedHeight = Math.min(height, maxHeight);
  const unclampedTop = placement === 'above'
    ? anchorRect.top - renderedHeight - offset
    : anchorRect.bottom + offset;
  const minTop = originTop + padding;
  const maxTop = Math.max(minTop, originTop + viewportSize.height - renderedHeight - padding);

  return {
    top: clamp(unclampedTop, minTop, maxTop),
    left: clamp(anchorRect.left, minLeft, maxLeft),
    placement,
    maxHeight,
  };
};
