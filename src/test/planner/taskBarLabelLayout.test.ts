import { describe, expect, it } from 'vitest';
import { getTaskBarLabelLayout } from '@/features/planner/lib/taskBarLabelLayout';

describe('getTaskBarLabelLayout', () => {
  it('keeps content in place when the task is fully visible', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 120,
      barWidth: 240,
      viewportLeft: 0,
      viewportWidth: 480,
      titleStartOffset: 56,
    });

    expect(result.visibleWidth).toBe(240);
    expect(result.contentOffset).toBe(0);
    expect(result.isShifted).toBe(false);
    expect(result.mode).toBe('full');
    expect(result.wrapTitle).toBe(false);
    expect(result.showProject).toBe(true);
    expect(result.showLeadingMeta).toBe(true);
  });

  it('keeps the default layout when the title is already visible', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 40,
      barWidth: 300,
      viewportLeft: 80,
      viewportWidth: 320,
      titleStartOffset: 56,
    });

    expect(result.visibleWidth).toBe(260);
    expect(result.contentOffset).toBe(0);
    expect(result.isShifted).toBe(false);
    expect(result.mode).toBe('full');
    expect(result.wrapTitle).toBe(false);
    expect(result.showProject).toBe(true);
    expect(result.showLeadingMeta).toBe(true);
  });

  it('shifts content right only when the title is fully outside the viewport', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 40,
      barWidth: 300,
      viewportLeft: 120,
      viewportWidth: 320,
      titleStartOffset: 56,
    });

    expect(result.visibleWidth).toBe(220);
    expect(result.contentOffset).toBe(24);
    expect(result.isShifted).toBe(true);
    expect(result.mode).toBe('full');
    expect(result.wrapTitle).toBe(false);
    expect(result.showProject).toBe(true);
    expect(result.showLeadingMeta).toBe(true);
  });

  it('keeps short clipped tasks unchanged', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 40,
      barWidth: 180,
      viewportLeft: 120,
      viewportWidth: 320,
      titleStartOffset: 56,
    });

    expect(result.visibleWidth).toBe(100);
    expect(result.contentOffset).toBe(0);
    expect(result.isShifted).toBe(false);
    expect(result.mode).toBe('full');
    expect(result.wrapTitle).toBe(false);
    expect(result.showProject).toBe(true);
    expect(result.showLeadingMeta).toBe(true);
  });

  it('falls back to minimal mode only when a shifted task has a very narrow visible segment', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 0,
      barWidth: 320,
      viewportLeft: 280,
      viewportWidth: 80,
      titleStartOffset: 56,
    });

    expect(result.visibleWidth).toBe(40);
    // In minimal mode showLeadingMeta=false, so no leading icons are rendered.
    // contentOffset must equal hiddenLeftWidth (280) so the title lands at the
    // viewport left edge, not hiddenTitleWidth (224) which would leave it 56px
    // before the viewport and invisible.
    expect(result.contentOffset).toBe(280);
    expect(result.isShifted).toBe(true);
    expect(result.mode).toBe('minimal');
    expect(result.wrapTitle).toBe(true);
    expect(result.showProject).toBe(false);
    expect(result.showLeadingMeta).toBe(false);
  });

  it('wraps the title and hides the project when a shifted task has limited visible width', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 40,
      barWidth: 320,
      viewportLeft: 120,
      viewportWidth: 170,
      titleStartOffset: 56,
    });

    expect(result.visibleWidth).toBe(170);
    expect(result.contentOffset).toBe(24);
    expect(result.isShifted).toBe(true);
    expect(result.mode).toBe('compact');
    expect(result.wrapTitle).toBe(true);
    expect(result.showProject).toBe(false);
    expect(result.showLeadingMeta).toBe(true);
  });
});
