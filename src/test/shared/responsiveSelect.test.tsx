import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const mocks = vi.hoisted(() => ({ isMobile: true }));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

import { ResponsiveSelect } from '@/shared/ui/responsive-select';

const OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

const Harness: React.FC<{ initial?: string }> = ({ initial = 'todo' }) => {
  const [value, setValue] = React.useState(initial);
  return (
    <ResponsiveSelect
      value={value}
      onValueChange={setValue}
      options={OPTIONS}
      title="Status"
      placeholder="Select status"
    />
  );
};

describe('ResponsiveSelect on a phone', () => {
  it('picks a value from a full-screen list and closes', async () => {
    mocks.isMobile = true;
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'To do' }));

    const list = await screen.findByRole('dialog', { name: 'Status' });
    // A plain list of buttons — no Radix Select viewport, which a finger
    // cannot scroll.
    expect(within(list).getAllByRole('button').length).toBeGreaterThan(3);

    await user.click(screen.getByRole('button', { name: 'In progress' }));

    expect(screen.queryByRole('dialog', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In progress' })).toBeInTheDocument();
  });

  it('shows the placeholder when nothing matches the current value', async () => {
    mocks.isMobile = true;
    render(<Harness initial="" />);

    expect(screen.getByRole('button', { name: 'Select status' })).toBeInTheDocument();
  });
});
