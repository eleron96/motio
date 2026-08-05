import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';

const DECK_WIDTH = 390;

const renderDeck = (
  props: Partial<React.ComponentProps<typeof MobileSwipeDeck>> = {},
) => {
  const onIndexChange = vi.fn();
  const onEdgeBack = vi.fn();

  const view = render(
    <MobileSwipeDeck
      index={props.index ?? 0}
      count={3}
      onIndexChange={onIndexChange}
      onEdgeBack={onEdgeBack}
      {...props}
    >
      <div>Page one</div>
      <div>Page two</div>
      <div>Page three</div>
    </MobileSwipeDeck>,
  );

  const deck = screen.getByTestId('mobile-swipe-deck');
  // jsdom has no layout — the deck reads its own width to size the commit
  // threshold, so give it a phone-sized one.
  Object.defineProperty(deck, 'offsetWidth', { configurable: true, value: DECK_WIDTH });

  return { ...view, deck, onIndexChange, onEdgeBack };
};

const swipe = (deck: HTMLElement, from: number, to: number, y = 200) => {
  fireEvent.pointerDown(deck, { pointerId: 1, clientX: from, clientY: y });
  fireEvent.pointerMove(deck, { pointerId: 1, clientX: to, clientY: y });
  fireEvent.pointerUp(deck, { pointerId: 1, clientX: to, clientY: y });
};

describe('MobileSwipeDeck', () => {
  it('advances to the next page on a swipe left', () => {
    const { deck, onIndexChange } = renderDeck({ index: 0 });

    swipe(deck, 300, 100);

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('goes back a page on a swipe right', () => {
    const { deck, onIndexChange, onEdgeBack } = renderDeck({ index: 1 });

    swipe(deck, 100, 300);

    expect(onIndexChange).toHaveBeenCalledWith(0);
    expect(onEdgeBack).not.toHaveBeenCalled();
  });

  it('calls onEdgeBack when swiping right on the first page', () => {
    const { deck, onIndexChange, onEdgeBack } = renderDeck({ index: 0 });

    swipe(deck, 100, 300);

    expect(onIndexChange).not.toHaveBeenCalled();
    expect(onEdgeBack).toHaveBeenCalledTimes(1);
  });

  it('ignores short drags below the commit threshold', () => {
    const { deck, onIndexChange, onEdgeBack } = renderDeck({ index: 1 });

    swipe(deck, 200, 170);

    expect(onIndexChange).not.toHaveBeenCalled();
    expect(onEdgeBack).not.toHaveBeenCalled();
  });

  it('leaves vertical gestures to the page scroller', () => {
    const { deck, onIndexChange } = renderDeck({ index: 0 });

    fireEvent.pointerDown(deck, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 190, clientY: 260 });
    // Even a later horizontal move must not page: the axis is already lost.
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 20, clientY: 260 });
    fireEvent.pointerUp(deck, { pointerId: 1, clientX: 20, clientY: 260 });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('does not page when the gesture starts inside a horizontal scroller', () => {
    const onIndexChange = vi.fn();
    render(
      <MobileSwipeDeck index={0} count={2} onIndexChange={onIndexChange}>
        <div>
          <div data-swipe-ignore data-testid="strip">Sections strip</div>
        </div>
        <div>Page two</div>
      </MobileSwipeDeck>,
    );

    const deck = screen.getByTestId('mobile-swipe-deck');
    Object.defineProperty(deck, 'offsetWidth', { configurable: true, value: DECK_WIDTH });
    const strip = screen.getByTestId('strip');

    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 60, clientY: 100 });
    fireEvent.pointerUp(deck, { pointerId: 1, clientX: 60, clientY: 100 });

    expect(onIndexChange).not.toHaveBeenCalled();
  });
});
