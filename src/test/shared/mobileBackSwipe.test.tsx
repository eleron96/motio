import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MobilePickerScreen } from '@/shared/ui/mobile-picker-screen';
import { useBackSwipe } from '@/shared/hooks/useBackSwipe';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';

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

const BackSwipeHarness = ({ onBack }: { onBack: () => void }) => {
  const { ref, ...handlers } = useBackSwipe(onBack);
  return <div ref={ref} data-testid="bare-screen" {...handlers}>content</div>;
};

const fireTouchMove = (element: HTMLElement, clientX: number, clientY: number) => {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientX, clientY }] });
  element.dispatchEvent(event);
  // "Delivered" as the browser sees it: a prevented touchmove is the veto.
  return !event.defaultPrevented;
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

  it('does not pick the option it was swiped across', async () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <MobilePickerScreen
        open
        onOpenChange={onOpenChange}
        title="Project"
        options={[{ value: 'a', label: 'Brand Refresh' }]}
        value="a"
        onValueChange={onValueChange}
      />,
    );

    const screenEl = screen.getByRole('dialog');
    const row = screen.getByRole('button', { name: 'Brand Refresh' });

    fireEvent.pointerDown(row, { pointerId: 1, clientX: 40, clientY: 400 });
    fireEvent.pointerMove(screenEl, { pointerId: 1, clientX: 160, clientY: 405 });
    fireEvent.pointerUp(screenEl, { pointerId: 1, clientX: 160, clientY: 405 });
    fireEvent.click(row);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('vetoes the browser once the drag is clearly a back swipe', () => {
    render(<BackSwipeHarness onBack={vi.fn()} />);
    const el = screen.getByTestId('bare-screen');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 40, clientY: 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 160, clientY: 405 });

    // A cancelled touchmove is what stops the browser from taking the drag for
    // a scroll and firing pointercancel, which left the screen half-dragged.
    expect(fireTouchMove(el, 160, 405)).toBe(false);
  });

  it('leaves a vertical drag to the content', () => {
    render(<BackSwipeHarness onBack={vi.fn()} />);
    const el = screen.getByTestId('bare-screen');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 180, clientY: 300 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 184, clientY: 420 });

    expect(fireTouchMove(el, 184, 420)).toBe(true);
  });

  it('closes itself instead of paging the deck that rendered it', async () => {
    const onOpenChange = vi.fn();
    const onIndexChange = vi.fn();

    render(
      <MobileSwipeDeck index={1} count={2} onIndexChange={onIndexChange}>
        <div>Section one</div>
        <MobileScreenShell open onOpenChange={onOpenChange} title="Members">
          <div>Members list</div>
        </MobileScreenShell>
      </MobileSwipeDeck>,
    );

    const screenEl = screen.getByRole('dialog');
    fireEvent.pointerDown(screenEl, { pointerId: 1, clientX: 40, clientY: 400 });
    fireEvent.pointerMove(screenEl, { pointerId: 1, clientX: 200, clientY: 405 });
    fireEvent.pointerUp(screenEl, { pointerId: 1, clientX: 200, clientY: 405 });

    // A portal leaves the DOM but not the React tree, so without isolation the
    // deck underneath would swallow this and slide to the previous section.
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(onIndexChange).not.toHaveBeenCalled();
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
