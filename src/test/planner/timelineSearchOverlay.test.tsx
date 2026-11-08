import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import type { TaskSearchHit } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((text, part, index) => text + part + (values[index] ?? ''), '')
  ),
}));

const mocks = vi.hoisted(() => ({
  navigation: { focusHit: vi.fn(), focusNext: vi.fn(), openFocused: vi.fn() },
  planner: { projects: [], assignees: [], statuses: [] },
}));
vi.mock('@/features/planner/hooks/useTimelineTaskSearch', () => ({
  useTimelineTaskSearchNavigation: () => mocks.navigation,
}));
vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (select: (state: typeof mocks.planner) => unknown) => select(mocks.planner),
}));
vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (select: (state: { locale: string }) => unknown) => select({ locale: 'en' }),
}));

import { TimelineSearchOverlay } from '@/features/planner/components/timeline/TimelineSearchOverlay';

const hit: TaskSearchHit = {
  description: undefined,
  id: 'task-1', title: 'Release preparation', projectId: null, assigneeIds: [],
  statusId: 'status-1', typeId: 'type-1', priority: null, tagIds: [], repeatId: null,
  startDate: '2026-11-06', endDate: '2026-11-06',
  matchedSubtaskTitle: 'Review the long deployment checklist',
};

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left, y: top, left, top, right: left + width, bottom: top + height,
  width, height, toJSON: () => ({}),
});

describe('timeline search result peek', () => {
  let cardHeight = 180;
  let rootHeight = 400;
  const resizeCallbacks: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    cardHeight = 180;
    rootHeight = 400;
    resizeCallbacks.length = 0;
    useTaskSearchStore.setState({
      open: true, query: 'review', hits: [hit], focusedId: hit.id,
      visibleRange: { start: '2026-11-01', end: '2026-11-30' }, sidebarWidth: 180,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.taskId) return rect(300, 440, 160, 30);
      return rect(0, 100, 900, rootHeight);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => cardHeight);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => (
      window.setTimeout(() => callback(0), 16)
    ));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resizeCallbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    useTaskSearchStore.getState().closeSearch();
  });

  const renderOverlay = () => render(
    <div>
      <div className="task-bar" data-task-id={hit.id} />
      <TimelineSearchOverlay />
    </div>,
  );

  it('explains the subtask match and opens its parent task', () => {
    const { container } = renderOverlay();

    expect(screen.getByText(hit.title)).toBeVisible();
    expect(container.querySelector('p')).toHaveTextContent('Subtask: Review the long deployment checklist');
    expect(container.querySelector('mark')).toHaveTextContent('Review');
    fireEvent.click(screen.getByRole('button', { name: 'Open task' }));
    expect(mocks.navigation.openFocused).toHaveBeenCalledTimes(1);
  });

  it('leaves title matches without a subtask explanation', () => {
    useTaskSearchStore.setState({ query: 'release', hits: [{ ...hit, matchedSubtaskTitle: null }] });
    const { container } = renderOverlay();
    expect(container.querySelector('p')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open task' })).toBeVisible();
  });

  it('repositions using the measured height when wrapping makes the card taller', () => {
    renderOverlay();
    const card = screen.getByText(hit.title).parentElement!;
    expect(card.style.top).toBe('150px');

    cardHeight = 300;
    act(() => {
      resizeCallbacks.forEach((resize) => resize());
      vi.advanceTimersByTime(20);
    });

    expect(card.style.top).toBe('30px');
    expect(Number.parseFloat(card.style.top) + cardHeight).toBeLessThan(rootHeight);
  });

  it('keeps an oversized peek within a short viewport with bounded scrolling', () => {
    rootHeight = 180;
    cardHeight = 300;
    renderOverlay();
    const card = screen.getByText(hit.title).parentElement!;
    const top = Number.parseFloat(card.style.top);
    const maxHeight = Number.parseFloat(card.style.maxHeight);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + maxHeight).toBeLessThanOrEqual(rootHeight);
    expect(maxHeight).toBeLessThan(cardHeight);
  });
});
