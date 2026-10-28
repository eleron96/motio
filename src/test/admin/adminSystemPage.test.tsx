import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/lib/appVersion', () => ({ APP_VERSION: '0.10.27' }));

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/infrastructure/auth/functionsGateway', () => ({ invokeAdminFunction: invoke }));

import AdminSystemPage from '@/features/admin/pages/AdminSystemPage';
import { isNewerVersion } from '@/features/admin/lib/systemStatus';

const status = (overrides: Record<string, unknown> = {}) => ({
  services: [
    { key: 'gateway', ok: true, ms: 4 },
    { key: 'keycloak', ok: false, ms: null },
  ],
  latestRelease: { tag: 'v0.11.0', url: 'https://github.com/eleron96/motio/releases/tag/v0.11.0', publishedAt: null },
  updateCheck: 'ok',
  selfHosted: true,
  configured: { email: false, push: true, errorTracking: false },
  ...overrides,
});

describe('isNewerVersion', () => {
  it('compares release tags with the running version', () => {
    expect(isNewerVersion('0.10.27', 'v0.11.0')).toBe(true);
    expect(isNewerVersion('0.10.27', 'v0.10.27')).toBe(false);
    expect(isNewerVersion('0.10.27', 'v0.10.9')).toBe(false);
    expect(isNewerVersion('0.10.27', 'nightly')).toBe(false);
  });
});

describe('AdminSystemPage', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('shows services, an available update with the command, and what is switched on', async () => {
    invoke.mockResolvedValueOnce({ data: { status: status() } });
    render(<AdminSystemPage />);

    expect(await screen.findByText('Version v0.11.0 is available.')).toBeInTheDocument();
    expect(screen.getByText('infra/scripts/install.sh update --version v0.11.0')).toBeInTheDocument();
    expect(screen.getByText('API gateway')).toBeInTheDocument();
    expect(screen.getByText('not responding')).toBeInTheDocument();
    expect(screen.getByText('VITE_FEATURE_TIME_OFF')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith({ action: 'system.status' });
  });

  it('does not show the update command on the public site', async () => {
    invoke.mockResolvedValueOnce({ data: { status: status({ selfHosted: false }) } });
    render(<AdminSystemPage />);

    expect(await screen.findByText('Version v0.11.0 is available.')).toBeInTheDocument();
    expect(screen.queryByText(/install\.sh update/)).not.toBeInTheDocument();
  });

  it('reports the outcome of a test email', async () => {
    invoke
      .mockResolvedValueOnce({ data: { status: status({ latestRelease: null, updateCheck: 'disabled' }) } })
      .mockResolvedValueOnce({ data: { result: { status: 'not_configured' } } });
    const user = userEvent.setup();
    render(<AdminSystemPage />);

    expect(await screen.findByText('Update check is off (MOTIO_UPDATE_CHECK=false).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(await screen.findByText('Email is not configured: no SMTP server in the settings.')).toBeInTheDocument();
    expect(invoke).toHaveBeenLastCalledWith({ action: 'system.testEmail' });
  });
});
