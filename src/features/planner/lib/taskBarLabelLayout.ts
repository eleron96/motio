export type TaskBarLabelMode = 'full' | 'compact' | 'minimal';

type TaskBarLabelLayoutInput = {
  barLeft: number;
  barWidth: number;
  viewportLeft: number;
  viewportWidth: number;
};

type TaskBarLabelLayout = {
  availableWidth: number;
  visibleWidth: number;
  contentOffset: number;
  mode: TaskBarLabelMode;
  showProject: boolean;
  showLeadingMeta: boolean;
};

const CONTENT_SIDE_INSET = 12;
const FULL_MODE_MIN_WIDTH = 176;
const COMPACT_MODE_MIN_WIDTH = 104;
const LONG_TASK_MIN_WIDTH_FOR_SHIFT = 240;

export const getTaskBarLabelLayout = ({
  barLeft,
  barWidth,
  viewportLeft,
  viewportWidth,
}: TaskBarLabelLayoutInput): TaskBarLabelLayout => {
  const safeBarWidth = Math.max(0, barWidth);
  const safeViewportWidth = Math.max(0, viewportWidth);
  const viewportRight = viewportLeft + safeViewportWidth;
  const barRight = barLeft + safeBarWidth;
  const visibleLeft = Math.max(barLeft, viewportLeft);
  const visibleRight = Math.min(barRight, viewportRight);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const hiddenLeftWidth = Math.max(0, visibleLeft - barLeft);
  const contentOffset = safeBarWidth >= LONG_TASK_MIN_WIDTH_FOR_SHIFT
    ? hiddenLeftWidth
    : 0;
  const availableWidth = Math.max(0, visibleWidth - CONTENT_SIDE_INSET * 2);

  const mode: TaskBarLabelMode = availableWidth >= FULL_MODE_MIN_WIDTH
    ? 'full'
    : availableWidth >= COMPACT_MODE_MIN_WIDTH
      ? 'compact'
      : 'minimal';

  return {
    availableWidth,
    visibleWidth,
    contentOffset,
    mode,
    showProject: mode === 'full',
    showLeadingMeta: mode !== 'minimal',
  };
};
