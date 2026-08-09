import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const mocks = vi.hoisted(() => ({ isMobile: true }));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

import { TagMultiSelect } from '@/features/planner/components/TagMultiSelect';

const TAGS = [
  { id: 't1', name: 'urgent', color: '#ff0000' },
  { id: 't2', name: 'design', color: '#00ff00' },
  { id: 't3', name: 'backend', color: '#0000ff' },
];

const Harness: React.FC<{ initial?: string[] }> = ({ initial = [] }) => {
  const [ids, setIds] = React.useState<string[]>(initial);
  return (
    <TagMultiSelect
      tags={TAGS}
      selectedTagIds={ids}
      onToggleTag={(tagId) => setIds((current) => (
        current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
      ))}
    />
  );
};

describe('TagMultiSelect on a phone', () => {
  it('ticks tags on a full-screen list instead of typing into a chip box', async () => {
    mocks.isMobile = true;
    const user = userEvent.setup();
    render(<Harness />);

    // No typeahead input on the closed field — a summary you tap.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Select tags/ }));

    const screenEl = await screen.findByRole('dialog', { name: 'Tags' });
    // Every tag is listed, ticked or not — not only the unselected ones.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);

    await user.click(screen.getByRole('checkbox', { name: /urgent/ }));
    await user.click(screen.getByRole('checkbox', { name: /backend/ }));

    // The screen stays open while several are ticked.
    expect(screen.getByRole('dialog', { name: 'Tags' })).toBe(screenEl);
    expect(screen.getByRole('checkbox', { name: /urgent/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /backend/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /design/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('unticking a tag removes it', async () => {
    mocks.isMobile = true;
    const user = userEvent.setup();
    render(<Harness initial={['t1', 't2']} />);

    await user.click(screen.getByRole('button', { name: /urgent/ }));
    await user.click(screen.getByRole('checkbox', { name: /urgent/ }));

    expect(screen.getByRole('checkbox', { name: /urgent/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: /design/ })).toHaveAttribute('aria-checked', 'true');
  });
});
