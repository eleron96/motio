import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MobilePickerScreen } from '@/shared/ui/mobile-picker-screen';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const renderPicker = () => {
  const onOpenChange = vi.fn();
  render(
    <MobilePickerScreen
      open
      onOpenChange={onOpenChange}
      title="Project"
      options={[
        { value: 'a', label: 'Brand Refresh' },
        { value: 'b', label: 'Data Migration' },
      ]}
      value="a"
      onValueChange={vi.fn()}
    />,
  );
  return { screenEl: screen.getByRole('dialog'), onOpenChange };
};

describe('Swipe back on the picker screen', () => {
  it('closes on a rightward swipe', async () => {
    const { screenEl, onOpenChange } = renderPicker();

    fireEvent.pointerDown(screenEl, { pointerId: 1, clientX: 40, clientY: 400 });
    fireEvent.pointerMove(screenEl, { pointerId: 1, clientX: 160, clientY: 405 });
    fireEvent.pointerUp(screenEl, { pointerId: 1, clientX: 160, clientY: 405 });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('ignores a short swipe, a leftward one, and a vertical scroll', () => {
    const { screenEl, onOpenChange } = renderPicker();

    // Too short.
    fireEvent.pointerDown(screenEl, { pointerId: 1, clientX: 40, clientY: 400 });
    fireEvent.pointerMove(screenEl, { pointerId: 1, clientX: 90, clientY: 400 });
    fireEvent.pointerUp(screenEl, { pointerId: 1, clientX: 90, clientY: 400 });

    // Leftward.
    fireEvent.pointerDown(screenEl, { pointerId: 2, clientX: 300, clientY: 400 });
    fireEvent.pointerMove(screenEl, { pointerId: 2, clientX: 100, clientY: 400 });
    fireEvent.pointerUp(screenEl, { pointerId: 2, clientX: 100, clientY: 400 });

    // Vertical — that is the list scrolling.
    fireEvent.pointerDown(screenEl, { pointerId: 3, clientX: 180, clientY: 300 });
    fireEvent.pointerMove(screenEl, { pointerId: 3, clientX: 200, clientY: 560 });
    fireEvent.pointerUp(screenEl, { pointerId: 3, clientX: 200, clientY: 560 });

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
