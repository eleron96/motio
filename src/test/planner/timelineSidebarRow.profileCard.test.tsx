import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineSidebarRow } from '@/features/planner/components/timeline/TimelineSidebarRow';
import type { TimelineDisplayRow } from '@/features/planner/lib/timelineSelectors';

// Radix Popover positioning (floating-ui) needs ResizeObserver, absent in jsdom.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

const row: TimelineDisplayRow = {
  id: 'a1',
  name: 'Alice Baker',
  color: undefined,
  tasks: [],
  height: 104,
};

const getMonogram = (name: string) => name.slice(0, 1).toUpperCase();

const renderRow = ({
  email = 'alice@example.com',
  mobile = false,
}: { email?: string | null; mobile?: boolean } = {}) => {
  const getAvatarInfo = vi.fn(() => ({
    avatarUrl: null,
    userId: 'u1',
    email,
  }));
  render(
    <TimelineSidebarRow
      row={row}
      width="220px"
      isMobile={mobile}
      isMobileAssigneeTimeline={mobile}
      sidebarViewportWidth={mobile ? 56 : 220}
      groupMode="assignee"
      getMonogram={getMonogram}
      getAvatarInfo={getAvatarInfo}
    />,
  );
  return { getAvatarInfo };
};

describe('TimelineSidebarRow profile popover', () => {
  it('opens a profile card with name and email when the desktop avatar is clicked', () => {
    renderRow();

    const trigger = screen.getByRole('button', { name: 'Alice Baker' });
    fireEvent.click(trigger);

    const emailLink = screen.getByRole('link', { name: 'alice@example.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:alice@example.com');
    // Name appears both in the sidebar row and inside the opened card.
    expect(screen.getAllByText('Alice Baker').length).toBeGreaterThanOrEqual(2);
  });

  it('omits the email row when the assignee has no email', () => {
    renderRow({ email: null });

    fireEvent.click(screen.getByRole('button', { name: 'Alice Baker' }));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByText('Alice Baker').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the same profile card from the mobile avatar popover', () => {
    renderRow({ mobile: true });

    fireEvent.click(screen.getByRole('button', { name: 'Alice Baker' }));

    const emailLink = screen.getByRole('link', { name: 'alice@example.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:alice@example.com');
  });

  it('does not render a clickable avatar for the unassigned row', () => {
    render(
      <TimelineSidebarRow
        row={{ ...row, id: 'unassigned', name: 'Unassigned' }}
        width="220px"
        isMobile={false}
        isMobileAssigneeTimeline={false}
        sidebarViewportWidth={220}
        groupMode="assignee"
        getMonogram={getMonogram}
        getAvatarInfo={vi.fn(() => ({ avatarUrl: null, userId: 'unassigned', email: null }))}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
