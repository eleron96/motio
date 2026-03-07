import { describe, expect, it } from 'vitest';
import { getTaskBarLabelLayout } from '@/features/planner/lib/taskBarLabelLayout';

describe('getTaskBarLabelLayout', () => {
  it('keeps content in place when the task is fully visible', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 120,
      barWidth: 240,
      viewportLeft: 0,
      viewportWidth: 480,
    });

    expect(result.visibleWidth).toBe(240);
    expect(result.contentOffset).toBe(0);
    expect(result.mode).toBe('full');
    expect(result.showProject).toBe(true);
    expect(result.showLeadingMeta).toBe(true);
  });

  it('shifts content right when the left part of the task is outside the viewport', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 40,
      barWidth: 240,
      viewportLeft: 120,
      viewportWidth: 320,
    });

    expect(result.visibleWidth).toBe(160);
    expect(result.contentOffset).toBe(80);
    expect(result.mode).toBe('compact');
    expect(result.showProject).toBe(false);
    expect(result.showLeadingMeta).toBe(true);
  });

  it('keeps short clipped tasks unchanged', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 40,
      barWidth: 180,
      viewportLeft: 120,
      viewportWidth: 320,
    });

    expect(result.visibleWidth).toBe(100);
    expect(result.contentOffset).toBe(0);
    expect(result.mode).toBe('minimal');
    expect(result.showProject).toBe(false);
    expect(result.showLeadingMeta).toBe(false);
  });

  it('falls back to minimal mode for a very narrow visible segment', () => {
    const result = getTaskBarLabelLayout({
      barLeft: 0,
      barWidth: 320,
      viewportLeft: 280,
      viewportWidth: 80,
    });

    expect(result.visibleWidth).toBe(40);
    expect(result.contentOffset).toBe(280);
    expect(result.mode).toBe('minimal');
    expect(result.showProject).toBe(false);
    expect(result.showLeadingMeta).toBe(false);
  });
});
