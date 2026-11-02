import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StarterTemplateChooserHost } from '@/features/workspace/components/StarterTemplateChooserHost';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

const { authState, applyStarterTemplate } = vi.hoisted(() => ({
  authState: {
    currentWorkspaceId: 'ws-1' as string | null,
    currentWorkspaceRole: 'admin' as 'admin' | 'editor' | 'viewer',
    workspaces: [{ id: 'ws-1', templatePending: true }],
  },
  applyStarterTemplate: vi.fn(),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: { applyStarterTemplate: typeof applyStarterTemplate }) => unknown) => (
    selector({ applyStarterTemplate })
  ),
}));

describe('StarterTemplateChooserHost', () => {
  beforeEach(() => {
    authState.currentWorkspaceId = 'ws-1';
    authState.currentWorkspaceRole = 'admin';
    authState.workspaces = [{ id: 'ws-1', templatePending: true }];
    applyStarterTemplate.mockReset();
    applyStarterTemplate.mockResolvedValue({});
  });

  it('asks the owner of a new workspace what the team does', async () => {
    render(<StarterTemplateChooserHost />);

    expect(await screen.findByText('What does your team do?')).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('Architecture and design'),
      expect.stringContaining('BIM and project support'),
      expect.stringContaining('Construction and installation'),
      expect.stringContaining('Software development'),
      expect.stringContaining('Empty workspace'),
    ]);
  });

  it.each([
    ['an editor', () => { authState.currentWorkspaceRole = 'editor'; }],
    ['a workspace already set up', () => { authState.workspaces = [{ id: 'ws-1', templatePending: false }]; }],
  ])('stays away for %s', (_case, arrange) => {
    arrange();
    const { container } = render(<StarterTemplateChooserHost />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('starter-template-chooser')).toBeNull();
  });

  it('applies the chosen template to the current workspace', async () => {
    render(<StarterTemplateChooserHost />);
    await screen.findByTestId('starter-template-chooser');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Construction and installation/ }));
    });

    expect(applyStarterTemplate).toHaveBeenCalledWith('ws-1', 'construction');
  });

  it('says so and lets the person try again when applying fails', async () => {
    applyStarterTemplate.mockResolvedValue({ error: 'boom' });
    render(<StarterTemplateChooserHost />);
    await screen.findByTestId('starter-template-chooser');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Empty workspace/ }));
    });

    expect(screen.getByRole('alert').textContent).toBe("Couldn't set up the workspace. Try again.");
    expect(screen.getByRole('button', { name: /Empty workspace/ }).hasAttribute('disabled')).toBe(false);
  });

  /** "Empty workspace" is the way to skip; a stray Escape is not. */
  it('does not close on Escape', async () => {
    render(<StarterTemplateChooserHost />);
    await screen.findByTestId('starter-template-chooser');

    fireEvent.keyDown(screen.getByTestId('starter-template-chooser'), { key: 'Escape' });
    expect(screen.getByTestId('starter-template-chooser')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});
