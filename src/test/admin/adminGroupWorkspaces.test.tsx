import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { groupState, adminState, toastMock } = vi.hoisted(() => ({
  groupState: {
    enabled: true,
    removeEnabled: false,
    mappings: [] as Array<Record<string, unknown>>,
    groups: ['/Design', '/Company/Leads'],
    groupsError: null as string | null,
    loaded: true,
    loading: false,
    error: null as string | null,
    load: vi.fn(),
    createMapping: vi.fn(),
    deleteMapping: vi.fn(),
  },
  adminState: {
    adminWorkspaces: [{ id: 'ws-north', name: 'North' }],
    fetchAdminWorkspaces: vi.fn(),
  },
  toastMock: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/admin/store/groupWorkspacesStore', () => ({
  useGroupWorkspacesStore: (selector?: (s: typeof groupState) => unknown) =>
    (typeof selector === 'function' ? selector(groupState) : groupState),
}));
vi.mock('@/features/admin/store/adminStore', () => ({
  useAdminStore: (selector?: (s: typeof adminState) => unknown) =>
    (typeof selector === 'function' ? selector(adminState) : adminState),
}));
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

import AdminGroupWorkspacesPage from '@/features/admin/pages/AdminGroupWorkspacesPage';

const mapping = {
  id: 'map-1',
  groupPath: '/Design',
  workspaceId: 'ws-north',
  workspaceName: 'North',
  role: 'editor',
  createdAt: '2026-11-08T10:00:00Z',
};

describe('AdminGroupWorkspacesPage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
    Object.assign(groupState, {
      enabled: true, removeEnabled: false, mappings: [], groupsError: null, loaded: true, loading: false, error: null,
    });
    groupState.load.mockReset();
    groupState.createMapping.mockReset();
    groupState.deleteMapping.mockReset().mockResolvedValue({});
    toastMock.success.mockReset();
    toastMock.info.mockReset();
  });

  it('explains how to turn the setting on when it is off', () => {
    groupState.enabled = false;
    render(<AdminGroupWorkspacesPage />);
    expect(screen.getByText(/Turned off on this server/)).toBeInTheDocument();
    expect(screen.getByText('KEYCLOAK_WORKSPACES_FROM_GROUPS=true')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add mapping' })).not.toBeInTheDocument();
  });

  it('says access is only added unless removal is on', () => {
    const { rerender } = render(<AdminGroupWorkspacesPage />);
    expect(screen.getByText(/Access is only added/)).toBeInTheDocument();
    groupState.removeEnabled = true;
    rerender(<AdminGroupWorkspacesPage />);
    expect(screen.getByText(/the access it gave is taken away at their next visit/)).toBeInTheDocument();
  });

  it('offers the Keycloak groups and maps one to a workspace', async () => {
    groupState.createMapping.mockResolvedValue({ outcome: 'created' });
    const { container } = render(<AdminGroupWorkspacesPage />);

    const options = [...container.querySelectorAll('datalist option')].map((option) => option.getAttribute('value'));
    expect(options).toEqual(['/Design', '/Company/Leads']);

    const button = screen.getByRole('button', { name: 'Add mapping' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Keycloak group'), { target: { value: '/Design' } });
    // Radix Select opens from the keyboard in jsdom (no pointer capture there).
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Workspace' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'North' }));
    fireEvent.click(button);

    await waitFor(() => {
      expect(groupState.createMapping).toHaveBeenCalledWith({ groupPath: '/Design', workspaceId: 'ws-north', role: 'viewer' });
    });
    expect(toastMock.success).toHaveBeenCalledWith('People in /Design join North the next time they open Motio.');
  });

  it('lists the mappings and removes one after asking', async () => {
    groupState.mappings = [mapping];
    render(<AdminGroupWorkspacesPage />);

    expect(screen.getByText('/Design')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove mapping' }));
    expect(await screen.findByText(/nobody new joins through this group/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(groupState.deleteMapping).toHaveBeenCalledWith('map-1');
    });
  });
});
