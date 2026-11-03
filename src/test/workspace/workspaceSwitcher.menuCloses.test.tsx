import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

// One state object per store, so the functions keep their identity between
// renders like real store actions do (the dialog's effects depend on them).
const { authState, plannerState } = vi.hoisted(() => ({
  authState: {
    workspaces: [{ id: 'ws-1', name: 'North' }],
    currentWorkspaceId: 'ws-1',
    setCurrentWorkspaceId: () => undefined,
    createWorkspace: async () => ({}),
  },
  plannerState: {
    statuses: [],
    taskTypes: [],
    tags: [],
    loadWorkspaceTemplate: async () => ({ template: null }),
    saveWorkspaceTemplate: async () => ({}),
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(authState),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: unknown) => unknown) => selector(plannerState),
}));

describe('WorkspaceSwitcher menu', () => {
  it('closes when "Create workspace" opens its dialog, and stays closed after Cancel', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher />);

    await user.click(screen.getByRole('button', { name: 'North' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));

    const dialog = await screen.findByRole('dialog');
    // The open dialog hides everything behind it from the accessibility tree,
    // so look for the menu among hidden elements too.
    await waitFor(() => expect(screen.queryByRole('menu', { hidden: true })).not.toBeInTheDocument());

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
