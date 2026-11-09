import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MIN_ROW_HEIGHT,
  ROW_BOTTOM_SPACE,
  ROW_TOP_PADDING,
  TASK_GAP,
  TASK_HEIGHT,
} from '@/features/planner/lib/dateUtils';
import {
  NORMAL_TIMELINE_GEOMETRY,
  TIMELINE_GEOMETRY,
  isTimelineDensity,
} from '@/features/planner/lib/timelineDensity';
import { calculateTimelineRowHeights } from '@/features/planner/lib/timelineSelectors';
import { TimelineSidebarRow } from '@/features/planner/components/timeline/TimelineSidebarRow';
import type { TaskWithLane } from '@/features/planner/lib/taskLanes';

// Timeline density (timeline.density). Normal must be the timeline as it always
// was — the same numbers, the same object — and the denser ones lower rows.

const lanes = (count: number) => Array.from({ length: count }, (_, lane) => ({ id: `t${lane}`, lane })) as unknown as TaskWithLane[];

describe('timeline density', () => {
  it('keeps normal exactly on the usual sizes', () => {
    expect(NORMAL_TIMELINE_GEOMETRY).toMatchObject({
      taskHeight: TASK_HEIGHT,
      taskGap: TASK_GAP,
      rowTopPadding: ROW_TOP_PADDING,
      rowBottomSpace: ROW_BOTTOM_SPACE,
      minRowHeight: MIN_ROW_HEIGHT,
      tieredAvatars: true,
      twoLineBars: true,
    });
    expect(TIMELINE_GEOMETRY.normal).toBe(NORMAL_TIMELINE_GEOMETRY);
  });

  it('lays rows out as before when no density is given', () => {
    const byRow = { a: lanes(1), b: lanes(3) };
    const options = { minRowHeight: 56, taskHeight: TASK_HEIGHT, taskGap: TASK_GAP };
    const before = calculateTimelineRowHeights(byRow, options);
    expect(before).toEqual({ a: 92, b: 180 });
    expect(calculateTimelineRowHeights(byRow, {
      ...options,
      rowTopPadding: NORMAL_TIMELINE_GEOMETRY.rowTopPadding,
      rowBottomSpace: NORMAL_TIMELINE_GEOMETRY.rowBottomSpace,
    })).toEqual(before);
  });

  it('makes compact rows about half as tall', () => {
    const compact = TIMELINE_GEOMETRY.compact;
    const heights = calculateTimelineRowHeights({ a: lanes(1), b: lanes(3) }, {
      minRowHeight: compact.minRowHeight,
      taskHeight: compact.taskHeight,
      taskGap: compact.taskGap,
      rowTopPadding: compact.rowTopPadding,
      rowBottomSpace: compact.rowBottomSpace,
    });
    expect(heights).toEqual({ a: 44, b: 102 });
  });

  it('knows its values', () => {
    expect(isTimelineDensity('compact')).toBe(true);
    expect(isTimelineDensity('tiny')).toBe(false);
  });
});

describe('people column with small photos', () => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }
  const row = { id: 'a1', name: 'Alice Baker', color: undefined, tasks: [], height: 44 };
  const renderRow = (smallPhotos?: boolean) => render(
    <TimelineSidebarRow
      row={row}
      width="220px"
      isMobile={false}
      isMobileAssigneeTimeline={false}
      sidebarViewportWidth={220}
      groupMode="assignee"
      getMonogram={(name) => name.slice(0, 1)}
      getAvatarInfo={vi.fn(() => ({ avatarUrl: null, userId: 'u1', email: null }))}
      smallPhotos={smallPhotos}
    />,
  );

  it('puts a small photo next to the name', () => {
    renderRow(true);
    const name = screen.getByTitle('Alice Baker');
    expect(name.className).toContain('text-left');
    expect(name.parentElement?.className).not.toContain('flex-col');
  });

  it('keeps the large photo above the name by default', () => {
    renderRow();
    const name = screen.getByTitle('Alice Baker');
    expect(name.className).toContain('text-center');
    expect(name.parentElement?.className).toContain('flex-col');
  });
});
