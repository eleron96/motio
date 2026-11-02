import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileOnboardingCards } from '@/features/onboarding/components/MobileOnboardingCards';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const visibleCardTitle = () => {
  const deck = screen.getByTestId('mobile-swipe-deck');
  const page = Array.from(deck.querySelectorAll('h2')).find((title) => !title.closest('[aria-hidden="true"]'));
  return page?.textContent;
};

describe('MobileOnboardingCards', () => {
  it('walks an editor through four cards and closes on the last one', () => {
    const onClose = vi.fn();
    render(<MobileOnboardingCards open canEdit onClose={onClose} />);

    const seen = [visibleCardTitle()];
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      seen.push(visibleCardTitle());
    }

    expect(seen).toEqual([
      "Your team's shared timeline",
      'Tap, double-tap, hold',
      'Add a task',
      'Sections',
    ]);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves adding tasks and the hold menu out for a viewer', () => {
    render(<MobileOnboardingCards open canEdit={false} onClose={vi.fn()} />);

    const deck = screen.getByTestId('mobile-swipe-deck');
    expect(Array.from(deck.querySelectorAll('h2')).map((title) => title.textContent)).toEqual([
      "Your team's shared timeline",
      'Tap, double-tap, hold',
      'Sections',
    ]);
    expect(deck.textContent).not.toContain('Hold for quick actions');
  });

  it('lets the person skip at any card', () => {
    const onClose = vi.fn();
    render(<MobileOnboardingCards open canEdit onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** A stray touch outside the sheet must not count the intro as seen forever. */
  it('stays open on a tap outside the sheet', () => {
    const onClose = vi.fn();
    render(<MobileOnboardingCards open canEdit onClose={onClose} />);

    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('mobile-onboarding-cards')).toBeTruthy();
  });
});
