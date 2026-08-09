import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssigneeProfileCard } from '@/features/planner/components/timeline/AssigneeProfileCard';

const renderCard = (avatarUrl: string | null = null) => {
  const { container } = render(
    <AssigneeProfileCard
      name="Алина Борисова"
      email="alina@example.com"
      avatarUrl={avatarUrl}
      colorSeed="user-1"
      initials="АБ"
    />,
  );
  return container.firstElementChild as HTMLElement;
};

describe('AssigneeProfileCard', () => {
  it('sizes the avatar against the viewport', () => {
    const card = renderCard();

    // Both axes are bounded so the popover fits a phone in portrait and a
    // short desktop window alike.
    const size = card.style.getPropertyValue('--assignee-avatar');
    expect(size).toContain('74vw');
    expect(size).toContain('46vh');
  });

  it('lets a monogram take the full size', () => {
    const card = renderCard();

    expect(card.style.getPropertyValue('--assignee-avatar')).toContain('400px');
  });

  it('drives the avatar box from that variable', () => {
    const card = renderCard();
    const avatar = card.querySelector('.h-\\[var\\(--assignee-avatar\\)\\]');

    expect(avatar).not.toBeNull();
    // The preset `profile` size (h-28 w-28) must lose the tailwind-merge tie,
    // otherwise the popover silently goes back to the old 112px avatar.
    expect(avatar?.className).not.toContain('h-28');
    expect(avatar?.className).not.toContain('w-28');
    expect(avatar?.className).not.toContain('text-2xl');
  });

  it('keeps the person details', () => {
    renderCard();

    expect(screen.getByText('Алина Борисова')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'alina@example.com' })).toBeTruthy();
  });
});
