import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { addDays, format, parseISO } from 'date-fns';
import type { Task } from '@/features/planner/types/planner';
import type { TaskWithLane } from '@/features/planner/lib/taskLanes';
import {
  ROW_SETTLE_DELAY_MS,
  useAdaptiveRowHeights,
  type AdaptiveRow,
} from '@/features/planner/components/timeline/hooks/useAdaptiveRowHeights';

/**
 * Rows fit the days on screen: while the timeline is in use they only grow,
 * once it is left alone they only shrink, they hold while the day range
 * shifts, a jump sets them at once, and rows above the screen never move
 * what is on screen.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const DAY_KEYS = Array.from({ length: 61 }, (_, index) => format(addDays(parseISO('2026-03-01'), index), 'yyyy-MM-dd'));
const DAY_WIDTH = 40;
// 10 days on screen; grows for stacks within 4 days, keeps room at rest for 7.
const VIEWPORT_WIDTH = 400;
const metrics = { minRowHeight: 56, taskHeight: 40, taskGap: 4 };
const ONE_LANE = 60;
const THREE_LANES = 148;

const bar = (id: string, day: number, lane: number): TaskWithLane => ({
  id,
  title: id,
  projectId: null,
  assigneeIds: [],
  startDate: DAY_KEYS[day],
  endDate: DAY_KEYS[day],
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  lane,
} as Task & { lane: number });

// A stack three lanes deep on day 12.
const busyRow = (id: string): AdaptiveRow => ({
  id,
  tasks: [bar(`${id}-0`, 12, 0), bar(`${id}-1`, 12, 1), bar(`${id}-2`, 12, 2)],
  extra: 0,
});

/** Day `day` at the left edge of the screen. */
const at = (day: number) => day * DAY_WIDTH;

const makeContainer = (clientHeight = 300) => {
  const element = document.createElement('div');
  let scrollTop = 0;
  Object.defineProperty(element, 'scrollTop', { get: () => scrollTop, set: (value: number) => { scrollTop = value; }, configurable: true });
  Object.defineProperty(element, 'clientHeight', { get: () => clientHeight, configurable: true });
  return element;
};

const touchEvent = (type: string, touches: number) => {
  const event = new Event(type);
  Object.defineProperty(event, 'touches', { value: Array.from({ length: touches }, () => ({})) });
  return event;
};

type Props = { scrollLeft: number; hold?: boolean; epoch?: string; suspended?: boolean };

// Stable like the hook's real inputs: a fresh object per render would redo
// every decision and hide a stale one.
const NO_MIN_LANES: Record<string, number> = {};

const renderFit = (rows: AdaptiveRow[], initial: Props = { scrollLeft: at(20) }, container = makeContainer()) => {
  const scrollContainerRef = { current: container };
  const hook = renderHook((props: Props) => useAdaptiveRowHeights({
    rows,
    dayKeys: DAY_KEYS,
    minLanesByRow: NO_MIN_LANES,
    metrics,
    scrollLeft: props.scrollLeft,
    viewportWidth: VIEWPORT_WIDTH,
    dayWidth: DAY_WIDTH,
    epoch: props.epoch ?? 'ws|day',
    hold: props.hold ?? false,
    suspended: props.suspended ?? false,
    scrollContainerRef,
    headerHeight: 50,
  }), { initialProps: initial });
  const scroll = () => act(() => { container.dispatchEvent(new Event('scroll')); });
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  return { ...hook, container, scroll, wait };
};

describe('useAdaptiveRowHeights', () => {
  it('fits the days on screen, not the whole rendered range', () => {
    const { result, rerender } = renderFit([busyRow('a')]);
    // Screen 20..29: the stack on day 12 is too far to count.
    expect(result.current.heights.a).toBe(ONE_LANE);

    rerender({ scrollLeft: at(16) });
    expect(result.current.heights.a).toBe(THREE_LANES);

    rerender({ scrollLeft: at(20) });
    expect(result.current.heights.a).toBe(ONE_LANE);
  });

  it('grows while in use once a stack comes within the grow margin, and never shrinks', () => {
    const { result, rerender, scroll } = renderFit([busyRow('a')]);

    scroll();
    rerender({ scrollLeft: at(17) });
    expect(result.current.heights.a).toBe(ONE_LANE);

    rerender({ scrollLeft: at(16) });
    expect(result.current.heights.a).toBe(THREE_LANES);
    expect(result.current.transition).toBe('height 200ms cubic-bezier(0.2, 0, 0, 1)');

    scroll();
    rerender({ scrollLeft: at(20) });
    expect(result.current.heights.a).toBe(THREE_LANES);
  });

  it('shrinks once the timeline has been left alone, softly', () => {
    const { result, rerender, scroll, wait } = renderFit([busyRow('a')]);
    scroll();
    rerender({ scrollLeft: at(16) });
    rerender({ scrollLeft: at(20) });

    wait(ROW_SETTLE_DELAY_MS - 50);
    expect(result.current.heights.a).toBe(THREE_LANES);

    wait(100);
    expect(result.current.heights.a).toBe(ONE_LANE);
    expect(result.current.transition).toBe('height 300ms cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('keeps room at rest for a stack just past the grow margin', () => {
    const { result, rerender, scroll, wait } = renderFit([busyRow('a')], { scrollLeft: at(16) });
    expect(result.current.heights.a).toBe(THREE_LANES);

    // Day 12 is 7 days off screen 19..28: out of the grow margin, inside the settle one.
    scroll();
    rerender({ scrollLeft: at(19) });
    wait(ROW_SETTLE_DELAY_MS + 50);
    expect(result.current.heights.a).toBe(THREE_LANES);
  });

  it('waits for the last scroll, not the first', () => {
    const { result, rerender, scroll, wait } = renderFit([busyRow('a')]);
    scroll();
    rerender({ scrollLeft: at(16) });
    rerender({ scrollLeft: at(20) });
    wait(500);
    scroll();
    wait(500);
    expect(result.current.heights.a).toBe(THREE_LANES);

    wait(250);
    expect(result.current.heights.a).toBe(ONE_LANE);
  });

  it('does not shrink while a finger is down, however long', () => {
    const { result, rerender, container, wait } = renderFit([busyRow('a')]);
    act(() => { container.dispatchEvent(touchEvent('touchstart', 1)); });
    rerender({ scrollLeft: at(16) });
    rerender({ scrollLeft: at(20) });

    wait(3000);
    expect(result.current.heights.a).toBe(THREE_LANES);

    act(() => { window.dispatchEvent(touchEvent('touchend', 0)); });
    wait(ROW_SETTLE_DELAY_MS + 50);
    expect(result.current.heights.a).toBe(ONE_LANE);
  });

  it('does not shrink while suspended, and settles a moment after', () => {
    const { result, rerender, wait } = renderFit([busyRow('a')]);
    rerender({ scrollLeft: at(16), suspended: true });
    rerender({ scrollLeft: at(20), suspended: true });
    wait(3000);
    expect(result.current.heights.a).toBe(THREE_LANES);

    rerender({ scrollLeft: at(20), suspended: false });
    expect(result.current.heights.a).toBe(THREE_LANES);

    wait(ROW_SETTLE_DELAY_MS + 50);
    expect(result.current.heights.a).toBe(ONE_LANE);
  });

  it('keeps the heights while the day range shifts', () => {
    const { result, rerender } = renderFit([busyRow('a')]);

    rerender({ scrollLeft: at(16), hold: true });
    expect(result.current.heights.a).toBe(ONE_LANE);
    expect(result.current.transition).toBe('none');

    rerender({ scrollLeft: at(16), hold: false });
    expect(result.current.heights.a).toBe(THREE_LANES);
  });

  it('sets the heights at once after a jump to dates that share nothing with the screen', () => {
    const { result, rerender } = renderFit([busyRow('a')], { scrollLeft: at(16) });
    expect(result.current.heights.a).toBe(THREE_LANES);

    rerender({ scrollLeft: at(40) });
    expect(result.current.heights.a).toBe(ONE_LANE);
    expect(result.current.transition).toBe('none');
    expect(result.current.instantRowIds.has('a')).toBe(true);
  });

  it('sets the heights at once after a navigation that shifted the day range, even mid-use', () => {
    const { result, rerender, scroll } = renderFit([busyRow('a')], { scrollLeft: at(16) });

    scroll();
    rerender({ scrollLeft: at(16), hold: true });
    rerender({ scrollLeft: at(40), hold: false });
    expect(result.current.heights.a).toBe(ONE_LANE);
    expect(result.current.transition).toBe('none');
  });

  it('treats a fling that lands a screen away as movement, not a jump', () => {
    const container = makeContainer(300);
    const { result, rerender, scroll } = renderFit([busyRow('above'), busyRow('visible')], { scrollLeft: at(16) }, container);
    container.scrollTop = 200;
    scroll();
    rerender({ scrollLeft: at(17) });

    // One slow frame: the next render is more than a screen further.
    scroll();
    rerender({ scrollLeft: at(30) });
    expect(result.current.heights.visible).toBe(THREE_LANES);
    expect(result.current.transition).not.toBe('none');
    expect(container.scrollTop).toBe(200);
  });

  it('does not settle while the mouse moves over the timeline or rests on a bar', () => {
    const { result, rerender, container, scroll, wait } = renderFit([busyRow('a')]);
    const bar = document.createElement('div');
    bar.dataset.taskId = 'a-0';
    container.appendChild(bar);
    const move = (target: Element) => act(() => {
      const event = new Event('pointermove', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      target.dispatchEvent(event);
    });

    scroll();
    rerender({ scrollLeft: at(16) });
    rerender({ scrollLeft: at(20) });
    wait(500);
    move(container);
    wait(500);
    expect(result.current.heights.a).toBe(THREE_LANES);

    move(bar);
    wait(3000);
    expect(result.current.heights.a).toBe(THREE_LANES);

    move(container);
    wait(ROW_SETTLE_DELAY_MS + 50);
    expect(result.current.heights.a).toBe(ONE_LANE);
  });

  it('grows a row that waited above the screen once scrolling up brings it into view', () => {
    const container = makeContainer(300);
    const { result, rerender, scroll } = renderFit([busyRow('above'), busyRow('visible')], { scrollLeft: at(20) }, container);
    container.scrollTop = 80;
    scroll();
    rerender({ scrollLeft: at(16) });
    expect(result.current.heights.above).toBe(ONE_LANE);

    container.scrollTop = 0;
    scroll();
    expect(result.current.heights.above).toBe(THREE_LANES);
    expect(result.current.instantRowIds.has('above')).toBe(false);
  });

  it('grows rows above the screen with the scroll corrected while suspended but still', () => {
    const container = makeContainer(300);
    const { result, rerender, scroll, wait } = renderFit([busyRow('above'), busyRow('visible')], { scrollLeft: at(20) }, container);
    container.scrollTop = 80;
    scroll();
    wait(ROW_SETTLE_DELAY_MS + 50);

    rerender({ scrollLeft: at(16), suspended: true });
    expect(result.current.heights.above).toBe(THREE_LANES);
    expect(container.scrollTop).toBe(80 + THREE_LANES - ONE_LANE);
  });

  it('sets the heights at once in a new epoch (filters, grouping, view)', () => {
    const { result, rerender, scroll } = renderFit([busyRow('a')], { scrollLeft: at(16) });

    scroll();
    rerender({ scrollLeft: at(20), epoch: 'ws|day|filtered' });
    expect(result.current.heights.a).toBe(ONE_LANE);
    expect(result.current.transition).toBe('none');
  });

  it('holds rows above the screen while in use, then resizes them without moving the screen', () => {
    const container = makeContainer(300);
    const { result, rerender, scroll, wait } = renderFit([busyRow('above'), busyRow('visible')], { scrollLeft: at(20) }, container);
    expect(result.current.heights).toEqual({ above: ONE_LANE, visible: ONE_LANE });

    // Header 50 px; 'above' spans 50..110, 'visible' 110..170. Scrolled 80 px
    // down, the visible band starts at 130: 'above' is out of sight.
    container.scrollTop = 80;
    scroll();
    rerender({ scrollLeft: at(16) });
    expect(result.current.heights).toEqual({ above: ONE_LANE, visible: THREE_LANES });
    expect(result.current.instantRowIds.has('visible')).toBe(false);

    wait(ROW_SETTLE_DELAY_MS + 50);
    expect(result.current.heights).toEqual({ above: THREE_LANES, visible: THREE_LANES });
    expect(result.current.instantRowIds.has('above')).toBe(true);
    expect(container.scrollTop).toBe(80 + THREE_LANES - ONE_LANE);
  });

  it('corrects scrollTop from where it was when the change was decided', () => {
    const container = makeContainer(300);
    const { rerender, scroll, wait } = renderFit([busyRow('above'), busyRow('visible')], { scrollLeft: at(16) }, container);
    container.scrollTop = 200;
    scroll();
    rerender({ scrollLeft: at(20) });
    wait(ROW_SETTLE_DELAY_MS + 50);

    // 'above' shrank by two lanes out of sight: the screen stays where it was.
    expect(container.scrollTop).toBe(200 - (THREE_LANES - ONE_LANE));
  });

  it('keeps the same heights object when nothing changes', () => {
    const { result, rerender } = renderFit([busyRow('a')]);
    const heights = result.current.heights;

    rerender({ scrollLeft: at(21) });
    expect(result.current.heights).toBe(heights);
  });
});
