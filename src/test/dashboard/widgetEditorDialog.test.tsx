import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

import { WidgetEditorDialog } from '@/features/dashboard/components/WidgetEditorDialog';

describe('WidgetEditorDialog disabled assignee toggle', () => {
  it('hides disabled assignees by default and reveals them when the toggle is enabled', async () => {
    const user = userEvent.setup();

    render(
      <WidgetEditorDialog
        open
        onOpenChange={vi.fn()}
        statuses={[]}
        projects={[]}
        assignees={[
          { id: 'active-1', name: 'Active User', isActive: true },
          { id: 'disabled-1', name: 'Disabled User', isActive: false },
        ]}
        groups={[]}
        onSave={vi.fn()}
      />,
    );

    const showDisabledSwitch = screen.getByRole('switch', { name: 'Show disabled users' });
    expect(showDisabledSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Add group' }));

    let comboboxes = screen.getAllByRole('combobox');
    await user.click(comboboxes[comboboxes.length - 1]);

    expect(await screen.findByRole('option', { name: 'Active User' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Disabled User' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(showDisabledSwitch);
    expect(showDisabledSwitch).toHaveAttribute('aria-checked', 'true');

    comboboxes = screen.getAllByRole('combobox');
    await user.click(comboboxes[comboboxes.length - 1]);

    expect(await screen.findByRole('option', { name: 'Disabled User' })).toBeInTheDocument();
  });
});
