import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({ useIsMobile: () => true }));

import { SubtaskImageStrip } from '@/features/planner/components/SubtaskImages';
import { LONG_PRESS_MS } from '@/shared/hooks/useLongPress';

const images = [{ id: 'm1', token: 't1' }];

const renderStrip = (canRemove = true) => {
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  render(
    <SubtaskImageStrip
      images={images}
      uploadingCount={0}
      resolveSrc={(image) => `https://app.example/functions/v1/task-media/${image.id}?token=${image.token}`}
      canRemove={canRemove}
      onOpen={onOpen}
      onRemove={onRemove}
    />,
  );
  return { onOpen, onRemove, thumb: screen.getByRole('button', { name: 'Open image' }) };
};

const hold = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { pointerType: 'touch', clientX: 10, clientY: 10 });
  act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });
  fireEvent.pointerUp(element, { pointerType: 'touch' });
  fireEvent.click(element);
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SubtaskImageStrip on a phone', () => {
  it('has no remove button on the thumbnail; a tap just opens the picture', () => {
    const { onOpen, thumb } = renderStrip();

    expect(screen.queryByRole('button', { name: 'Image actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
    fireEvent.click(thumb);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('touch and hold opens a sheet with the remove action, and the hold does not also open the picture', () => {
    const { onOpen, onRemove, thumb } = renderStrip();

    hold(thumb);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onRemove).toHaveBeenCalledWith('m1');
  });

  it('a finger that moves is scrolling, not holding', () => {
    renderStrip();
    const thumb = screen.getByRole('button', { name: 'Open image' });

    fireEvent.pointerDown(thumb, { pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(thumb, { pointerType: 'touch', clientX: 10, clientY: 60 });
    act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });

    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  });

  it('a viewer gets no menu from a hold', () => {
    const { thumb } = renderStrip(false);
    hold(thumb);
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  });
});
