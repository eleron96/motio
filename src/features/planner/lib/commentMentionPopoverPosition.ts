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

export interface CommentMentionPopoverPositionParams {
  anchorRect: RectLike;
  popoverSize: Size;
  viewportSize: ViewportSize;
  offset?: number;
  padding?: number;
}

export interface CommentMentionPopoverPosition {
  top: number;
  left: number;
  placement: 'above' | 'below';
}

const DEFAULT_OFFSET = 4;
const DEFAULT_PADDING = 8;

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
);

export const getCommentMentionPopoverPosition = ({
  anchorRect,
  popoverSize,
  viewportSize,
  offset = DEFAULT_OFFSET,
  padding = DEFAULT_PADDING,
}: CommentMentionPopoverPositionParams): CommentMentionPopoverPosition => {
  const width = Math.max(0, popoverSize.width);
  const height = Math.max(0, popoverSize.height);
  const maxLeft = Math.max(padding, viewportSize.width - width - padding);
  const availableAbove = anchorRect.top - padding - offset;
  const availableBelow = viewportSize.height - anchorRect.bottom - padding - offset;
  const placement = availableBelow < height && availableAbove > availableBelow
    ? 'above'
    : 'below';
  const unclampedTop = placement === 'above'
    ? anchorRect.top - height - offset
    : anchorRect.bottom + offset;
  const maxTop = Math.max(padding, viewportSize.height - height - padding);

  return {
    top: clamp(unclampedTop, padding, maxTop),
    left: clamp(anchorRect.left, padding, maxLeft),
    placement,
  };
};
