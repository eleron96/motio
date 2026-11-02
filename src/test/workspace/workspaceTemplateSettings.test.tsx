import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceTemplateSettings } from '@/features/workspace/components/WorkspaceTemplateSettings';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

const mocks = vi.hoisted(() => ({
  loadWorkspaceTemplate: vi.fn(),
  saveWorkspaceTemplate: vi.fn(),
  applyWorkspaceTemplate: vi.fn(),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: unknown) => unknown) => selector({
    workspaceId: 'ws-1',
    statuses: [{ id: 's1', name: 'Planned', emoji: null, color: '#000', isFinal: false, isCancelled: false }],
    taskTypes: [{ id: 't1', name: 'Work', icon: null }],
    tags: [],
    ...mocks,
  }),
}));

const renderSection = async () => {
  render(<WorkspaceTemplateSettings />);
  await act(async () => { await Promise.resolve(); });
};

describe('WorkspaceTemplateSettings', () => {
  beforeEach(() => {
    mocks.loadWorkspaceTemplate.mockReset();
    mocks.loadWorkspaceTemplate.mockResolvedValue({ template: null });
    mocks.saveWorkspaceTemplate.mockReset();
    mocks.saveWorkspaceTemplate.mockResolvedValue({});
    mocks.applyWorkspaceTemplate.mockReset();
    mocks.applyWorkspaceTemplate.mockResolvedValue({ added: { statuses: 1, taskTypes: 3, tags: 2 } });
  });

  it('adds what is missing from an industry template and says how much', async () => {
    await renderSection();

    expect(screen.getAllByRole('radio').map((option) => option.textContent)).toEqual([
      expect.stringContaining('Architecture and design'),
      expect.stringContaining('BIM and project support'),
      expect.stringContaining('Construction and installation'),
      expect.stringContaining('Software development'),
    ]);
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /BIM and project support/ }));
    await act(async () => { fireEvent.click(add); });

    expect(mocks.applyWorkspaceTemplate).toHaveBeenCalledWith('bim');
    expect(screen.getByRole('status').textContent).toBe('Added — statuses: 1, task types: 3, tags: 2.');
  });

  it('says so when the workspace already has everything', async () => {
    mocks.applyWorkspaceTemplate.mockResolvedValue({ added: { statuses: 0, taskTypes: 0, tags: 0 } });
    await renderSection();

    fireEvent.click(screen.getByRole('radio', { name: /Software development/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })); });

    expect(screen.getByRole('status').textContent).toBe('This workspace already has all of them.');
  });

  /**
   * Saving makes the own set appear as a choice — here and when creating the
   * next workspace — without reopening anything.
   */
  it('saves this workspace as the own set, which then becomes a choice', async () => {
    await renderSection();
    expect(screen.queryByRole('radio', { name: /My own set/ })).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save as my own set' })); });

    expect(mocks.saveWorkspaceTemplate).toHaveBeenCalledWith({
      statuses: [{ name: 'Planned', emoji: null, color: '#000', is_final: false, is_cancelled: false }],
      taskTypes: [{ name: 'Work', icon: null }],
      tags: [],
    });
    expect(screen.getByRole('radio', { name: /My own set/ })).toBeTruthy();
    expect(screen.getByText('Saved as your own set.')).toBeTruthy();
  });
});
