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
      maxHeight: 616,
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
      maxHeight: 708,
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
      maxHeight: 616,
    });
  });

  it('keeps clear of the keyboard: the visible band starts below the layout viewport top', () => {
    // A phone with the keyboard up: 390×380 of the screen is still visible, and
    // that band starts 120px down. Measured against the whole layout viewport
    // the caret would look like it had room below — it does not.
    expect(
      getCommentMentionPopoverPosition({
        anchorRect: { top: 400, left: 24, bottom: 420, right: 28 },
        popoverSize: { width: 256, height: 224 },
        viewportSize: { width: 390, height: 380 },
        viewportOrigin: { top: 120, left: 0 },
      }),
    ).toEqual({
      top: 172,
      left: 24,
      placement: 'above',
      maxHeight: 268,
    });
  });

  it('never covers the caret when it has to crop itself', () => {
    // Cramped band, caret in its upper half: there is more room below than
    // above, but not enough for the full list. Positioning must use the height
    // the popover will actually be — clamping as if it were full height would
    // drag it up over the word being typed.
    const position = getCommentMentionPopoverPosition({
      anchorRect: { top: 160, left: 24, bottom: 180, right: 28 },
      popoverSize: { width: 256, height: 224 },
      viewportSize: { width: 390, height: 380 },
    });

    expect(position).toEqual({ top: 184, left: 24, placement: 'below', maxHeight: 188 });
    expect(position.top).toBeGreaterThan(180);
    // Idempotent: re-running with the cropped height must not move it.
    expect(
      getCommentMentionPopoverPosition({
        anchorRect: { top: 160, left: 24, bottom: 180, right: 28 },
        popoverSize: { width: 256, height: position.maxHeight },
        viewportSize: { width: 390, height: 380 },
      }).top,
    ).toBe(position.top);
  });

  it('caps the popover to the room left on the chosen side', () => {
    const { maxHeight, placement } = getCommentMentionPopoverPosition({
      anchorRect: { top: 150, left: 24, bottom: 170, right: 28 },
      popoverSize: { width: 256, height: 224 },
      viewportSize: { width: 390, height: 300 },
      viewportOrigin: { top: 120, left: 0 },
    });

    expect(placement).toBe('below');
    // 120 + 300 − 170 − 8 − 4
    expect(maxHeight).toBe(238);
  });
});
