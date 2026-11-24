import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskAssigneeField } from '@/features/planner/components/TaskAssigneeField';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';
import type { Assignee } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

// The picker of assignees marks people who were added by name only — and only
// while the server setting people.withoutAccount is on.

const member: Assignee = { id: 'a1', name: 'Anna Becker', userId: 'u1', isActive: true, email: null, phone: null };
const byName: Assignee = { id: 'a2', name: 'Van 2', userId: null, isActive: true, email: null, phone: null };
const sample: Assignee = { id: 'a3', name: 'Sample Colleague', userId: null, isActive: true, email: null, phone: null, isSample: true };
const people = [member, byName, sample];

const setSetting = (on: boolean) => {
  const store = useInstanceSettingsStore;
  store.setState({ values: { ...store.getState().values, 'people.withoutAccount': on } });
};

const openPicker = async () => {
  render(
    <TaskAssigneeField
      assignees={people}
      filteredAssignees={people}
      pickedAssigneeIds={[]}
      setPickedAssigneeIds={vi.fn()}
      canEdit
      isMobile={false}
    />,
  );
  await userEvent.setup().click(screen.getByRole('button'));
  await screen.findByText('Anna Becker');
};

describe('TaskAssigneeField: people without an account', () => {
  afterEach(() => setSetting(false));

  it('marks only the person added by name when the setting is on', async () => {
    setSetting(true);
    await openPicker();
    expect(screen.getAllByText('(no account)')).toHaveLength(1);
    // The mark sits beside the name, not inside it: a long name is cut, the mark is not.
    expect(screen.getByText('Van 2').closest('label')?.textContent).toContain('(no account)');
    expect(screen.getByText('Anna Becker').closest('label')?.textContent).not.toContain('(no account)');
  });

  it('marks nobody when the setting is off', async () => {
    setSetting(false);
    await openPicker();
    expect(screen.queryByText('(no account)')).toBeNull();
  });
});
