import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useSheetDragDismiss } from '@/shared/hooks/useSheetDragDismiss';

const Harness: React.FC<{
  onDismiss: () => void;
  onRowClick?: () => void;
  scrollTop?: number;
}> = ({ onDismiss, onRowClick = () => {}, scrollTop = 0 }) => {
  const drag = useSheetDragDismiss(onDismiss);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (ref.current) Object.defineProperty(ref.current, 'scrollTop', { value: scrollTop, writable: true });
  }, [scrollTop]);

  return (
    <div ref={ref} data-testid="sheet" style={drag.style} {...drag.handlers}>
      <button type="button" onClick={onRowClick}>row</button>
    </div>
  );
};

const drag = (from: { x: number; y: number }, to: { x: number; y: number }, id = 1) => {
  const sheet = screen.getByTestId('sheet');
  fireEvent.pointerDown(sheet, { pointerId: id, clientX: from.x, clientY: from.y });
  fireEvent.pointerMove(sheet, { pointerId: id, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(sheet, { pointerId: id, clientX: to.x, clientY: to.y });
};

describe('Dragging a bottom sheet down', () => {
  it('dismisses past the threshold', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    drag({ x: 200, y: 300 }, { x: 205, y: 420 });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('springs back on a short pull', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    drag({ x: 200, y: 300 }, { x: 200, y: 360 }); // 60px — short of 90

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('sheet')).not.toHaveStyle({ transform: 'translateY(60px)' });
  });

  it('never starts on an upward or sideways pull, so the row underneath still works', () => {
    const onDismiss = vi.fn();
    const onRowClick = vi.fn();
    render(<Harness onDismiss={onDismiss} onRowClick={onRowClick} />);

    drag({ x: 200, y: 400 }, { x: 200, y: 200 }, 1); // upward
    drag({ x: 200, y: 300 }, { x: 40, y: 305 }, 2);  // sideways

    // A gesture that never armed swallows no click: the sheet must not eat the
    // tap that follows a sideways swipe or an upward flick.
    fireEvent.click(screen.getByRole('button', { name: 'row' }));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('leaves the gesture to the list when the sheet is already scrolled', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} scrollTop={120} />);

    drag({ x: 200, y: 300 }, { x: 200, y: 460 });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not dismiss when the system takes the gesture away', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const sheet = screen.getByTestId('sheet');

    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 200, clientY: 440 });
    fireEvent.pointerCancel(sheet, { pointerId: 1, clientX: 200, clientY: 440 });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('swallows the click a finished drag would otherwise land on a row', () => {
    const onDismiss = vi.fn();
    const onRowClick = vi.fn();
    render(<Harness onDismiss={onDismiss} onRowClick={onRowClick} />);

    drag({ x: 200, y: 300 }, { x: 200, y: 350 });
    // The drag was short, so nothing was dismissed — and letting the row it
    // ended on fire would open something the user never tapped.
    fireEvent.click(screen.getByRole('button', { name: 'row' }));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
