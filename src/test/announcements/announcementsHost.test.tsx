import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnouncementsHost } from '@/features/announcements/components/AnnouncementsHost';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { state } = vi.hoisted(() => ({
  state: {
    announcements: [] as Array<{ id: string; title: string; body: string | null; level: 'info' | 'critical' }>,
    dismiss: vi.fn(async () => undefined),
  },
}));

vi.mock('@/features/announcements/hooks/useAnnouncements', () => ({
  useAnnouncements: () => state,
}));

describe('AnnouncementsHost', () => {
  beforeEach(() => {
    state.dismiss.mockClear();
    state.announcements = [];
  });

  it('stays out of the way when there is nothing to say', () => {
    const { container } = render(<AnnouncementsHost />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an ordinary announcement as a strip that can be closed', async () => {
    const user = userEvent.setup();
    state.announcements = [
      { id: 'a1', title: 'Mobile got a rebuild', body: 'Swipe between sections.', level: 'info' },
    ];

    render(<AnnouncementsHost />);

    expect(screen.getByText('Mobile got a rebuild')).toBeInTheDocument();
    expect(screen.getByText('Swipe between sections.')).toBeInTheDocument();
    // A strip, not a dialog: the page underneath stays usable.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss announcement' }));

    expect(state.dismiss).toHaveBeenCalledWith('a1');
  });

  it('interrupts for a service notice, and counts the acknowledgement as read', async () => {
    const user = userEvent.setup();
    state.announcements = [
      { id: 'a2', title: 'Maintenance at 22:00', body: 'Save your work.', level: 'critical' },
    ];

    render(<AnnouncementsHost />);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Maintenance at 22:00');

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(state.dismiss).toHaveBeenCalledWith('a2');
  });

  it('shows one at a time so the header never becomes a feed', () => {
    state.announcements = [
      { id: 'a1', title: 'First', body: null, level: 'info' },
      { id: 'a2', title: 'Second', body: null, level: 'info' },
    ];

    render(<AnnouncementsHost />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });
});
