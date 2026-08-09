import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileStackScreen, type MobileStackSection } from '@/shared/ui/mobile-stack-screen';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const SECTIONS: MobileStackSection[] = [
  { id: 'general', label: 'General', content: <p>General settings</p> },
  { id: 'display', label: 'Display', content: <p>Display settings</p> },
  { id: 'danger', label: 'Danger zone', tone: 'danger', content: <p>Danger settings</p> },
];

const Harness: React.FC<{
  onBack?: () => void;
  onOpenChange?: (open: boolean) => void;
}> = ({ onBack, onOpenChange }) => {
  const [activeId, setActiveId] = React.useState('general');
  return (
    <MobileStackScreen
      open
      onOpenChange={onOpenChange ?? (() => {})}
      title="Workspace settings"
      onBack={onBack}
      sections={SECTIONS}
      activeId={activeId}
      onActiveChange={setActiveId}
    />
  );
};

describe('MobileStackScreen', () => {
  it('lists every section in the strip and mounts the reachable pages', () => {
    render(<Harness />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workspace settings' })).toBeInTheDocument();
    SECTIONS.forEach((section) => {
      expect(screen.getByRole('button', { name: section.label })).toBeInTheDocument();
    });

    // Current page plus the one a swipe away; the far section waits.
    expect(screen.getByText('General settings')).toBeInTheDocument();
    expect(screen.getByText('Display settings')).toBeInTheDocument();
    expect(screen.queryByText('Danger settings')).not.toBeInTheDocument();
  });

  it('switches sections from the tab strip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const displayTab = screen.getByRole('button', { name: 'Display' });
    expect(displayTab).toHaveAttribute('aria-pressed', 'false');

    await user.click(displayTab);

    expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('swiping left moves to the next section', () => {
    render(<Harness />);

    const deck = screen.getByTestId('mobile-swipe-deck');
    Object.defineProperty(deck, 'offsetWidth', { configurable: true, value: 390 });

    fireEvent.pointerDown(deck, { pointerId: 1, clientX: 320, clientY: 300 });
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 80, clientY: 300 });
    fireEvent.pointerUp(deck, { pointerId: 1, clientX: 80, clientY: 300 });

    expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('swiping right on the first section goes back', () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} />);

    const deck = screen.getByTestId('mobile-swipe-deck');
    Object.defineProperty(deck, 'offsetWidth', { configurable: true, value: 390 });

    fireEvent.pointerDown(deck, { pointerId: 1, clientX: 40, clientY: 300 });
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(deck, { pointerId: 1, clientX: 300, clientY: 300 });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers back and close in the header', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onOpenChange = vi.fn();
    render(<Harness onBack={onBack} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('omits the strip for a single-section screen', () => {
    render(
      <MobileStackScreen
        open
        onOpenChange={() => {}}
        title="Notifications"
        sections={[{ id: 'all', label: 'All', content: <p>Inbox</p> }]}
        activeId="all"
        onActiveChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });
});
