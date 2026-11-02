import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateWorkspaceDialog } from '@/features/workspace/components/CreateWorkspaceDialog';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

const mocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  loadWorkspaceTemplate: vi.fn(),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    workspaces: [{ id: 'ws-1' }],
    createWorkspace: mocks.createWorkspace,
  }),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: unknown) => unknown) => selector({
    statuses: [],
    taskTypes: [],
    tags: [],
    loadWorkspaceTemplate: mocks.loadWorkspaceTemplate,
    saveWorkspaceTemplate: vi.fn(),
  }),
}));

const renderOpen = async () => {
  render(<CreateWorkspaceDialog open onOpenChange={vi.fn()} />);
  await act(async () => { await Promise.resolve(); });
};

describe('CreateWorkspaceDialog', () => {
  beforeEach(() => {
    mocks.createWorkspace.mockReset();
    mocks.createWorkspace.mockResolvedValue({});
    mocks.loadWorkspaceTemplate.mockReset();
    mocks.loadWorkspaceTemplate.mockResolvedValue({ template: null });
  });

  it('asks what the team does and creates the workspace from the chosen template', async () => {
    await renderOpen();

    const options = screen.getAllByRole('radio').map((option) => option.textContent);
    expect(options).toEqual([
      expect.stringContaining('Architecture and design'),
      expect.stringContaining('BIM and project support'),
      expect.stringContaining('Construction and installation'),
      expect.stringContaining('Software development'),
      expect.stringContaining('Empty workspace'),
    ]);

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Site crews' } });
    const create = screen.getByRole('button', { name: 'Create' });
    // A name alone is not enough: the starting point is part of the decision.
    expect(create.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /Construction and installation/ }));
    expect(screen.getByRole('radio', { name: /Construction and installation/ }).getAttribute('aria-checked')).toBe('true');
    await act(async () => { fireEvent.click(create); });

    expect(mocks.createWorkspace).toHaveBeenCalledWith('Site crews', 'construction');
  });

  /** Nothing saved is the usual state, not an error to show in red. */
  it('says nothing about a personal set that was never saved', async () => {
    await renderOpen();

    expect(screen.queryByText(/No template saved yet/)).toBeNull();
    expect(screen.queryByRole('radio', { name: /My own set/ })).toBeNull();
  });

  it('offers the saved personal set first and picks it', async () => {
    mocks.loadWorkspaceTemplate.mockResolvedValue({
      template: { statuses: [{ name: 'Mine', emoji: null, color: '#000', is_final: false, is_cancelled: false }], taskTypes: [], tags: [] },
    });
    await renderOpen();

    const own = screen.getByRole('radio', { name: /My own set/ });
    expect(screen.getAllByRole('radio')[0]).toBe(own);
    expect(own.getAttribute('aria-checked')).toBe('true');
  });
});
