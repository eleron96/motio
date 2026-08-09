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

import { RepeatPopoverField } from '@/features/planner/components/RepeatPopoverField';
import type { RepeatEnds, RepeatFrequency } from '@/features/planner/lib/taskFormRules';

const Harness: React.FC = () => {
  const [frequency, setFrequency] = React.useState<RepeatFrequency>('none');
  const [ends, setEnds] = React.useState<RepeatEnds>('never');
  const [until, setUntil] = React.useState('');
  const [count, setCount] = React.useState(1);

  return (
    <RepeatPopoverField
      count={count}
      ends={ends}
      frequency={frequency}
      idPrefix="new"
      onCountInputChange={(value) => setCount(Number(value) || 1)}
      onEndsChange={setEnds}
      onFrequencyChange={setFrequency}
      onUntilChange={setUntil}
      until={until}
    />
  );
};

describe('Repeat settings on a phone', () => {
  it('opens a screen, turns repeats on, and picks a frequency and a limit', async () => {
    mocks.isMobile = true;
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Repeat settings' }));
    const screenEl = await screen.findByRole('dialog', { name: 'Repeat' });

    // Off to start with: nothing but the toggle.
    expect(screen.queryByRole('button', { name: 'Weekly' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Repeat task/ }));
    await user.click(await screen.findByRole('button', { name: 'Weekly' }));
    await user.click(screen.getByRole('button', { name: 'Count' }));

    // Which row is in effect has to be announced, not just ticked.
    expect(screen.getByRole('button', { name: 'Weekly', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daily', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Count', pressed: true })).toBeInTheDocument();

    // Choosing a limit reveals its field on the same screen, not in a popover.
    expect(screen.getByLabelText('Occurrences')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Repeat' })).toBe(screenEl);
  });

  it('leaves through the back arrow with the summary updated', async () => {
    mocks.isMobile = true;
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Repeat settings' }));
    await user.click(await screen.findByRole('switch', { name: /Repeat task/ }));
    await user.click(await screen.findByRole('button', { name: 'Monthly' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByRole('dialog', { name: 'Repeat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repeat settings' })).toHaveTextContent('Monthly');
  });
});
