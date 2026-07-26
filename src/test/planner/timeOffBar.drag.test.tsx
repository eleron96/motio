import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeOffBar } from '@/features/planner/components/timeline/TimeOffBar';
import { buildTimeOffIndex } from '@/features/planner/lib/timeOff';
import type { TimeOff, TimeOffDragPreview } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const updateTimeOff = vi.fn(async () => ({}));
let dragPreview: TimeOffDragPreview = null;
const setTimeOffDragPreview = vi.fn((preview: TimeOffDragPreview) => {
  dragPreview = preview;
});

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    updateTimeOff,
    setTimeOffDragPreview,
  }),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const DAY_WIDTH = 40;

const stored: TimeOff = {
  id: 'to1',
  assigneeId: 'a1',
  startDate: '2026-08-04',
  endDate: '2026-08-05',
  note: null,
};

const visibleDays = Array.from({ length: 40 }, (_, index) => (
  new Date(`2026-08-${String(index + 1).padStart(2, '0')}T12:00:00`)
)).slice(0, 31);

/**
 * Mirrors TimelineGrid: the record handed to the bar comes out of
 * buildTimeOffIndex, i.e. it already carries the live drag preview. This is the
 * shape that made an earlier implementation feed its own output back in.
 */
const renderBar = () => {
  const view = render(<Harness />);
  return view;
};

const Harness: React.FC = () => {
  const [, force] = React.useReducer((count: number) => count + 1, 0);

  React.useEffect(() => {
    const original = setTimeOffDragPreview.getMockImplementation();
    setTimeOffDragPreview.mockImplementation((preview: TimeOffDragPreview) => {
      dragPreview = preview;
      force();
    });
    return () => {
      if (original) setTimeOffDragPreview.mockImplementation(original);
    };
  }, []);

  const index = buildTimeOffIndex([stored], visibleDays, dragPreview);
  const record = index.byRowId.get('a1')?.[0] ?? stored;

  return (
    <TimeOffBar
      record={record}
      position={{ left: 0, width: DAY_WIDTH * 2 }}
      dayWidth={DAY_WIDTH}
      siblings={[record]}
      canEditOwn
      onOpenDetail={onOpenDetail}
    />
  );
};

const onOpenDetail = vi.fn();

describe('TimeOffBar drag and resize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dragPreview = null;
    setTimeOffDragPreview.mockImplementation((preview: TimeOffDragPreview) => {
      dragPreview = preview;
    });
  });

  it('moves the whole period by the dragged number of days and saves it once', () => {
    renderBar();
    const bar = screen.getByTestId('timeline-time-off-to1');

    fireEvent.mouseDown(bar, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 100 + DAY_WIDTH * 3 });
    fireEvent.mouseUp(document);

    // +3 days from the ORIGINAL period, not from a preview-rebased one.
    expect(updateTimeOff).toHaveBeenCalledTimes(1);
    expect(updateTimeOff).toHaveBeenCalledWith('to1', {
      startDate: '2026-08-07',
      endDate: '2026-08-08',
    });
  });

  it('does not run away while the pointer is held (preview never re-bases the delta)', () => {
    renderBar();
    const bar = screen.getByTestId('timeline-time-off-to1');

    fireEvent.mouseDown(bar, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 100 + DAY_WIDTH });

    // One day of movement must mean exactly one day of preview, no matter how
    // many re-renders the preview triggers.
    expect(dragPreview).toEqual({ id: 'to1', startDate: '2026-08-05', endDate: '2026-08-06' });

    fireEvent.mouseUp(document);
    expect(updateTimeOff).toHaveBeenCalledWith('to1', {
      startDate: '2026-08-05',
      endDate: '2026-08-06',
    });
  });

  it('resizes from the right edge without moving the start', () => {
    const { container } = renderBar();
    const handles = container.querySelectorAll('.resize-handle');
    expect(handles).toHaveLength(2);

    fireEvent.mouseDown(handles[1], { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 100 + DAY_WIDTH * 2 });
    fireEvent.mouseUp(document);

    expect(updateTimeOff).toHaveBeenCalledWith('to1', {
      startDate: '2026-08-04',
      endDate: '2026-08-07',
    });
  });

  it('clears the drag preview when the gesture ends', () => {
    renderBar();
    const bar = screen.getByTestId('timeline-time-off-to1');

    fireEvent.mouseDown(bar, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 100 + DAY_WIDTH });
    fireEvent.mouseUp(document);

    expect(dragPreview).toBeNull();
  });

  it('saves nothing and opens the dialog on a plain click', () => {
    renderBar();
    const bar = screen.getByTestId('timeline-time-off-to1');

    fireEvent.mouseDown(bar, { button: 0, clientX: 100 });
    fireEvent.mouseUp(document);
    fireEvent.click(bar);

    expect(updateTimeOff).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledWith('to1');
  });

  it('does not open the dialog when the click follows a real drag', () => {
    renderBar();
    const bar = screen.getByTestId('timeline-time-off-to1');

    fireEvent.mouseDown(bar, { button: 0, clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 100 + DAY_WIDTH * 2 });
    fireEvent.mouseUp(document);
    fireEvent.click(bar);

    expect(updateTimeOff).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });
});
