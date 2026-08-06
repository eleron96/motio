import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/features/planner/hooks/usePersonColors', () => ({
  usePersonColors: () => ({ byAssigneeId: new Map(), byUserId: new Map() }),
}));

import { MobileAssigneeField } from '@/features/planner/components/MobileAssigneeField';

const PEOPLE = [
  { id: 'a1', name: 'Anna', userId: 'u1' },
  { id: 'a2', name: 'Boris', userId: 'u2' },
];

const Harness: React.FC<{ initial?: string[] }> = ({ initial = [] }) => {
  const [ids, setIds] = React.useState<string[]>(initial);
  return (
    <MobileAssigneeField
      label={ids.length === 0 ? 'Unassigned' : `${ids.length} assignees`}
      assignees={PEOPLE}
      selectedIds={ids}
      onChange={setIds}
    />
  );
};

describe('MobileAssigneeField', () => {
  it('picks several people from a full-screen checkbox list without closing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Unassigned/ }));

    const list = await screen.findByRole('dialog', { name: 'Assignees' });
    // Checkboxes, not single-choice rows.
    expect(screen.getAllByRole('checkbox').length).toBe(3);

    await user.click(screen.getByRole('checkbox', { name: /Anna/ }));
    expect(screen.getByRole('dialog', { name: 'Assignees' })).toBe(list);

    await user.click(screen.getByRole('checkbox', { name: /Boris/ }));
    expect(screen.getByRole('checkbox', { name: /Anna/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /Boris/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('treats "Unassigned" as clearing the selection', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a1', 'a2']} />);

    await user.click(screen.getByRole('button', { name: /2 assignees/ }));
    await user.click(screen.getByRole('checkbox', { name: /Unassigned/ }));

    expect(screen.getByRole('checkbox', { name: /Unassigned/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /Anna/ })).toHaveAttribute('aria-checked', 'false');
  });
});
