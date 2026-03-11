import { describe, expect, it } from 'vitest';

import { getCommentMentionPopoverPosition } from '@/features/planner/lib/commentMentionPopoverPosition';

describe('getCommentMentionPopoverPosition', () => {
  it('places the popover below the caret when the viewport has enough space', () => {
    expect(
      getCommentMentionPopoverPosition({
        anchorRect: { top: 120, left: 40, bottom: 140, right: 44 },
        popoverSize: { width: 256, height: 224 },
        viewportSize: { width: 1024, height: 768 },
      }),
    ).toEqual({
      top: 144,
      left: 40,
      placement: 'below',
    });
  });

  it('flips the popover above the caret near the viewport bottom', () => {
    expect(
      getCommentMentionPopoverPosition({
        anchorRect: { top: 720, left: 40, bottom: 740, right: 44 },
        popoverSize: { width: 256, height: 224 },
        viewportSize: { width: 1024, height: 768 },
      }),
    ).toEqual({
      top: 492,
      left: 40,
      placement: 'above',
    });
  });

  it('clamps the popover horizontally into the viewport', () => {
    expect(
      getCommentMentionPopoverPosition({
        anchorRect: { top: 120, left: 980, bottom: 140, right: 984 },
        popoverSize: { width: 256, height: 224 },
        viewportSize: { width: 1024, height: 768 },
      }),
    ).toEqual({
      top: 144,
      left: 760,
      placement: 'below',
    });
  });
});
