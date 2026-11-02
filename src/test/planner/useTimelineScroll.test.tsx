import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useTimelineScroll } from '@/features/planner/components/timeline/hooks/useTimelineScroll';

const visibleDays = [
  new Date('2026-03-16T00:00:00Z'),
  new Date('2026-03-17T00:00:00Z'),
  new Date('2026-03-18T00:00:00Z'),
];

const toDomRect = (rect: Partial<DOMRect>): DOMRect => ({
  x: rect.x ?? rect.left ?? 0,
  y: rect.y ?? rect.top ?? 0,
  width: rect.width ?? 0,
  height: rect.height ?? 0,
  top: rect.top ?? 0,
  right: rect.right ?? 0,
  bottom: rect.bottom ?? 0,
  left: rect.left ?? 0,
  toJSON: () => ({}),
});

const TimelineScrollHarness = ({
  highlightedTaskId,
  highlightedTaskRowAssigneeId,
  rangeShifting = false,
}: {
  highlightedTaskId: string | null;
  highlightedTaskRowAssigneeId: string | null;
  rangeShifting?: boolean;
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useTimelineScroll({
    scrollContainerRef,
    sidebarViewportWidth: 100,
    viewportWidth: 500,
    currentDate: '2026-03-17',
    currentDateObj: new Date('2026-03-17T00:00:00Z'),
    viewMode: 'week',
    dayWidth: 40,
    visibleDays,
    highlightedTaskId,
    highlightedTaskRowAssigneeId,
    tasksLength: 1,
    scrollTargetDate: null,
    scrollRequestId: 0,
    scrollReanchorMinShiftDays: 3,
    scrollReanchorEdgeTriggerDays: 2,
    setCurrentDate: vi.fn(),
    markTimelineInteraction: vi.fn(),
    rangeShifting,
  });

  return (
    <div ref={scrollContainerRef} data-testid="timeline-scroll-container">
      <div data-task-id="task-1" data-row-assignee-id="assignee-2" />
      <div data-task-id="task-1" data-row-assignee-id="assignee-1" />
    </div>
  );
};

describe('useTimelineScroll', () => {
  it('centers the highlighted task on both axes for the requested assignee row', async () => {
    const { getByTestId, rerender } = render(
      <TimelineScrollHarness highlightedTaskId={null} highlightedTaskRowAssigneeId={null} />,
    );

    const container = getByTestId('timeline-scroll-container') as HTMLDivElement;
    const task = container.querySelector<HTMLElement>('[data-task-id="task-1"][data-row-assignee-id="assignee-1"]');
    const otherTask = container.querySelector<HTMLElement>('[data-task-id="task-1"][data-row-assignee-id="assignee-2"]');

    expect(task).not.toBeNull();
    expect(otherTask).not.toBeNull();

    const scrollToMock = vi.fn();

    Object.defineProperty(container, 'clientWidth', { value: 700, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(container, 'scrollWidth', { value: 2400, configurable: true });
    Object.defineProperty(container, 'scrollLeft', { value: 50, writable: true, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 40, writable: true, configurable: true });
    Object.defineProperty(container, 'scrollTo', { value: scrollToMock, configurable: true });

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(toDomRect({
      left: 0,
      top: 100,
      width: 700,
      height: 300,
      right: 700,
      bottom: 400,
    }));
    vi.spyOn(otherTask!, 'getBoundingClientRect').mockReturnValue(toDomRect({
      left: 120,
      top: 180,
      width: 100,
      height: 40,
      right: 220,
      bottom: 220,
    }));
    vi.spyOn(task!, 'getBoundingClientRect').mockReturnValue(toDomRect({
      left: 450,
      top: 260,
      width: 100,
      height: 40,
      right: 550,
      bottom: 300,
    }));

    rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith({
        left: 200,
        top: 70,
        behavior: 'smooth',
      });
    });
  });

  const mockGeometry = (container: HTMLDivElement, taskTop: number) => {
    const task = container.querySelector<HTMLElement>('[data-task-id="task-1"][data-row-assignee-id="assignee-1"]')!;
    const scrollToMock = vi.fn();
    Object.defineProperty(container, 'clientWidth', { value: 700, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(container, 'scrollWidth', { value: 2400, configurable: true });
    Object.defineProperty(container, 'scrollLeft', { value: 50, writable: true, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 40, writable: true, configurable: true });
    Object.defineProperty(container, 'scrollTo', { value: scrollToMock, configurable: true });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(toDomRect({ left: 0, top: 100, width: 700, height: 300, right: 700, bottom: 400 }));
    const taskRect = vi.spyOn(task, 'getBoundingClientRect').mockReturnValue(toDomRect({ left: 450, top: taskTop, width: 100, height: 40, right: 550, bottom: taskTop + 40 }));
    return { scrollToMock, taskRect };
  };

  it('measures the highlighted bar only once the day range has stopped shifting', () => {
    const { getByTestId, rerender } = render(
      <TimelineScrollHarness highlightedTaskId={null} highlightedTaskRowAssigneeId={null} />,
    );
    const { scrollToMock } = mockGeometry(getByTestId('timeline-scroll-container') as HTMLDivElement, 260);

    rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" rangeShifting />);
    expect(scrollToMock).not.toHaveBeenCalled();

    rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);
    expect(scrollToMock).toHaveBeenCalledTimes(1);

    // A later shift alone (an edge re-anchor) does not scroll back to it.
    rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" rangeShifting />);
    rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);
    expect(scrollToMock).toHaveBeenCalledTimes(1);
  });

  it('brings the bar back to the middle once the smooth scroll is over if rows moved it', () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, rerender } = render(
        <TimelineScrollHarness highlightedTaskId={null} highlightedTaskRowAssigneeId={null} />,
      );
      const container = getByTestId('timeline-scroll-container') as HTMLDivElement;
      const { scrollToMock, taskRect } = mockGeometry(container, 260);

      rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);
      expect(scrollToMock).toHaveBeenCalledTimes(1);

      // Rows on the way grew: the bar ended up near the bottom edge.
      taskRect.mockReturnValue(toDomRect({ left: 450, top: 360, width: 100, height: 40, right: 550, bottom: 400 }));
      act(() => { vi.advanceTimersByTime(700); });

      expect(scrollToMock).toHaveBeenCalledTimes(2);
      // Centre 280 px down a 300 px band, scrolled 40: 40 + 280 - 150.
      expect(scrollToMock).toHaveBeenLastCalledWith({ top: 170, behavior: 'smooth' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not recentre once the person has taken the timeline over', () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, rerender } = render(
        <TimelineScrollHarness highlightedTaskId={null} highlightedTaskRowAssigneeId={null} />,
      );
      const container = getByTestId('timeline-scroll-container') as HTMLDivElement;
      const { scrollToMock, taskRect } = mockGeometry(container, 260);

      rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);
      taskRect.mockReturnValue(toDomRect({ left: 450, top: 360, width: 100, height: 40, right: 550, bottom: 400 }));
      act(() => { container.dispatchEvent(new Event('wheel')); });
      act(() => { vi.advanceTimersByTime(2000); });

      expect(scrollToMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the smooth scroll to come to a stop before recentring', () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, rerender } = render(
        <TimelineScrollHarness highlightedTaskId={null} highlightedTaskRowAssigneeId={null} />,
      );
      const container = getByTestId('timeline-scroll-container') as HTMLDivElement;
      const { scrollToMock, taskRect } = mockGeometry(container, 260);

      rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);
      taskRect.mockReturnValue(toDomRect({ left: 450, top: 360, width: 100, height: 40, right: 550, bottom: 400 }));
      // Still scrolling: a scroll event every 100 ms keeps it from recentring.
      for (let step = 0; step < 5; step += 1) {
        act(() => { container.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(100); });
      }
      expect(scrollToMock).toHaveBeenCalledTimes(1);

      act(() => { vi.advanceTimersByTime(200); });
      expect(scrollToMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the bar alone after the smooth scroll when it is already in the middle', () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, rerender } = render(
        <TimelineScrollHarness highlightedTaskId={null} highlightedTaskRowAssigneeId={null} />,
      );
      const { scrollToMock } = mockGeometry(getByTestId('timeline-scroll-container') as HTMLDivElement, 260);

      rerender(<TimelineScrollHarness highlightedTaskId="task-1" highlightedTaskRowAssigneeId="assignee-1" />);
      act(() => { vi.advanceTimersByTime(700); });

      expect(scrollToMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
