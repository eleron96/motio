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

// The page asks for its status, the sign-in checks card for the realm, and the
// test email button for a send: answer each by its action, in the order a test
// queues them for that action.
const answers = new Map<string, unknown[]>();
const queue = (action: string, ...values: unknown[]) => {
  answers.set(action, [...(answers.get(action) ?? []), ...values]);
};
const mockByAction = {
  mockResolvedValueOnce(value: { data?: Record<string, unknown> }) {
    const key = value.data && 'status' in value.data ? 'system.status' : 'system.testEmail';
    queue(key, value);
    return mockByAction;
  },
};

describe('AdminSystemPage', () => {
  beforeEach(() => {
    answers.clear();
    invoke.mockReset();
    invoke.mockImplementation(async (payload: { action: string }) => {
      const list = answers.get(payload.action) ?? [];
      if (list.length > 0) return list.shift();
      if (payload.action === 'system.signIn') return { error: 'not in this test' };
      return { error: `no answer for ${payload.action}` };
    });
  });

  it('shows services, an available update with the command, and what is switched on', async () => {
    mockByAction.mockResolvedValueOnce({ data: { status: status() } });
    render(<AdminSystemPage />);

    expect(await screen.findByText('Version v0.11.0 is available.')).toBeInTheDocument();
    expect(screen.getByText('infra/scripts/install.sh update --version v0.11.0')).toBeInTheDocument();
    expect(screen.getByText('API gateway')).toBeInTheDocument();
    expect(screen.getByText('not responding')).toBeInTheDocument();
    expect(screen.getByText('VITE_FEATURE_KANBAN')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith({ action: 'system.status' });
  });

  it('does not show the update command on the public site', async () => {
    mockByAction.mockResolvedValueOnce({ data: { status: status({ selfHosted: false }) } });
    render(<AdminSystemPage />);

    expect(await screen.findByText('Version v0.11.0 is available.')).toBeInTheDocument();
    expect(screen.queryByText(/install\.sh update/)).not.toBeInTheDocument();
  });

  it('reports the outcome of a test email', async () => {
    mockByAction
      .mockResolvedValueOnce({ data: { status: status({ latestRelease: null, updateCheck: 'disabled' }) } })
      .mockResolvedValueOnce({ data: { result: { status: 'not_configured' } } });
    const user = userEvent.setup();
    render(<AdminSystemPage />);

    expect(await screen.findByText('Update check is off (MOTIO_UPDATE_CHECK=false).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(await screen.findByText('Email is not configured: no SMTP server in the settings.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith({ action: 'system.testEmail' });
  });

  it('names MAILER_DRY_RUN when it keeps email off although an SMTP server is set', async () => {
    mockByAction
      .mockResolvedValueOnce({ data: { status: status({
        configured: { email: false, emailOffReason: 'dry_run_flag', push: true, errorTracking: false },
      }) } })
      .mockResolvedValueOnce({ data: { result: { status: 'not_configured', reason: 'dry_run_flag' } } });
    const user = userEvent.setup();
    render(<AdminSystemPage />);

    expect(await screen.findByText(/MAILER_DRY_RUN=1 in .env keeps Motio's own emails/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(await screen.findByText(/Email is turned off: MAILER_DRY_RUN=1 in .env/)).toBeInTheDocument();
  });
});
