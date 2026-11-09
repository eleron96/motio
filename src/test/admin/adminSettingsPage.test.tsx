import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { settingsState, toastMock } = vi.hoisted(() => ({
  settingsState: {
    settings: [] as Array<Record<string, unknown>>,
    loaded: true,
    loading: false,
    error: null as string | null,
    savingKey: null as string | null,
    load: vi.fn(),
    update: vi.fn(),
  },
  toastMock: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/admin/store/serverSettingsStore', () => ({
  useServerSettingsStore: (selector?: (s: typeof settingsState) => unknown) =>
    (typeof selector === 'function' ? selector(settingsState) : settingsState),
}));
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

import AdminSettingsPage from '@/features/admin/pages/AdminSettingsPage';

const setting = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  value: false,
  defaultValue: false,
  source: 'default',
  env: null,
  client: true,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  ...overrides,
});

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    Object.assign(settingsState, { loaded: true, loading: false, error: null, savingKey: null });
    settingsState.settings = [
      setting('groups.workspaces', { env: 'KEYCLOAK_WORKSPACES_FROM_GROUPS', client: false }),
      setting('timeline.density'),
      setting('workspaces.closures', {
        value: true, source: 'admin', updatedAt: '2026-11-09T10:00:00Z', updatedBy: 'u1', updatedByName: 'Anna',
      }),
      setting('groups.superAdmin', {
        value: true, source: 'env', env: 'KEYCLOAK_SUPER_ADMIN_FROM_GROUPS', client: false,
      }),
    ];
    settingsState.load.mockReset();
    settingsState.update.mockReset().mockResolvedValue({});
    toastMock.error.mockReset();
  });

  it('loads the settings and shows each one with its section and state', () => {
    render(<AdminSettingsPage />);
    expect(settingsState.load).toHaveBeenCalled();
    expect(screen.getByText('Sign-in and groups')).toBeInTheDocument();
    expect(screen.getByText('Timeline density')).toBeInTheDocument();
    expect(screen.getAllByText(/As out of the box/).length).toBeGreaterThan(0);
    expect(screen.getByText(/by Anna/)).toBeInTheDocument();
    expect(screen.getByText(/KEYCLOAK_SUPER_ADMIN_FROM_GROUPS=true in \.env/)).toBeInTheDocument();
  });

  it('turns a setting on', async () => {
    render(<AdminSettingsPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Timeline density' }));
    await waitFor(() => expect(settingsState.update).toHaveBeenCalledWith('timeline.density', true));
  });

  it('brings a changed setting back to its default', async () => {
    render(<AdminSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(settingsState.update).toHaveBeenCalledWith('workspaces.closures', null));
  });

  it('does not let the console change what .env decides', () => {
    render(<AdminSettingsPage />);
    expect(screen.getByRole('switch', { name: 'Super admins from a group' })).toBeDisabled();
  });

  it('shows a failed change', async () => {
    settingsState.update.mockResolvedValue({ error: 'nope' });
    render(<AdminSettingsPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Timeline density' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('nope'));
  });
});
