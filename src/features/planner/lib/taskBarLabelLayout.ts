export type TaskBarLabelMode = 'full' | 'compact' | 'minimal';

type TaskBarLabelLayoutInput = {
  barLeft: number;
  barWidth: number;
  viewportLeft: number;
  viewportWidth: number;
  titleStartOffset: number;
};

type TaskBarLabelLayout = {
  availableWidth: number;
  contentWidth: number;
  visibleWidth: number;
  contentOffset: number;
  isShifted: boolean;
  mode: TaskBarLabelMode;
  wrapTitle: boolean;
  showProject: boolean;
  showLeadingMeta: boolean;
};

type TaskBarTitleStartOffsetInput = {
  hasStatusEmoji: boolean;
  isCancelled: boolean;
  isRepeating: boolean;
  hasPriority: boolean;
};

const CONTENT_SIDE_INSET = 12;
const FULL_MODE_MIN_WIDTH = 176;
const COMPACT_MODE_MIN_WIDTH = 104;
const LONG_TASK_MIN_WIDTH_FOR_SHIFT = 240;
const WRAPPED_TITLE_MAX_WIDTH = 160;
const TASK_BAR_X_PADDING = 8;
const LEADING_META_GAP = 8;
const STATUS_EMOJI_WIDTH = 16;
const META_ICON_WIDTH = 12;
const PRIORITY_BADGE_WIDTH = 16;

export const getTaskBarTitleStartOffset = ({
  hasStatusEmoji,
  isCancelled,
  isRepeating,
  hasPriority,
}: TaskBarTitleStartOffsetInput): number => {
  const itemWidths = [
    hasStatusEmoji ? STATUS_EMOJI_WIDTH : 0,
    isCancelled ? META_ICON_WIDTH : 0,
    isRepeating ? META_ICON_WIDTH : 0,
    hasPriority ? PRIORITY_BADGE_WIDTH : 0,
  ].filter((width) => width > 0);

  if (itemWidths.length === 0) {
    return TASK_BAR_X_PADDING;
  }

  return TASK_BAR_X_PADDING
    + itemWidths.reduce((sum, width) => sum + width, 0)
    + LEADING_META_GAP * itemWidths.length;
};

export const getTaskBarLabelLayout = ({
  barLeft,
  barWidth,
  viewportLeft,
  viewportWidth,
  titleStartOffset,
}: TaskBarLabelLayoutInput): TaskBarLabelLayout => {
  const safeBarWidth = Math.max(0, barWidth);
  const safeViewportWidth = Math.max(0, viewportWidth);
  const viewportRight = viewportLeft + safeViewportWidth;
  const barRight = barLeft + safeBarWidth;
  const visibleLeft = Math.max(barLeft, viewportLeft);
  const visibleRight = Math.min(barRight, viewportRight);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const hiddenLeftWidth = Math.max(0, visibleLeft - barLeft);
  const safeTitleStartOffset = Math.max(0, titleStartOffset);
  const isShifted = safeBarWidth >= LONG_TASK_MIN_WIDTH_FOR_SHIFT
    && hiddenLeftWidth >= safeTitleStartOffset;
  const hiddenTitleWidth = Math.max(0, hiddenLeftWidth - safeTitleStartOffset);
  const availableWidth = Math.max(0, visibleWidth - CONTENT_SIDE_INSET * 2);
  const contentWidth = availableWidth;

  const mode: TaskBarLabelMode = !isShifted
    ? 'full'
    : availableWidth >= FULL_MODE_MIN_WIDTH
      ? 'full'
      : availableWidth >= COMPACT_MODE_MIN_WIDTH
        ? 'compact'
        : 'minimal';
  const wrapTitle = isShifted && availableWidth <= WRAPPED_TITLE_MAX_WIDTH;
  const contentOffset = !isShifted
    ? 0
    : hiddenTitleWidth;

  return {
    availableWidth,
    contentWidth,
    visibleWidth,
    contentOffset,
    isShifted,
    mode,
    wrapTitle,
    showProject: !isShifted || mode === 'full',
    showLeadingMeta: true,
  };
};
