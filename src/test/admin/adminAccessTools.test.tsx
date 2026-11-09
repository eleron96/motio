import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { invoke, toastMock, copyLink } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  copyLink: vi.fn(),
}));
vi.mock('@/infrastructure/auth/functionsGateway', () => ({ invokeAdminFunction: invoke }));
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));
vi.mock('@/features/workspace/hooks/useCopyInviteLink', () => ({ useCopyInviteLink: () => copyLink }));

import AdminAuditPage from '@/features/admin/pages/AdminAuditPage';
import AdminInvitationsPage from '@/features/admin/pages/AdminInvitationsPage';
import { AdminSignInChecks } from '@/features/admin/components/AdminSignInChecks';
import { AdminUserSignInSection } from '@/features/admin/components/AdminUserSignInSection';
import type { UserDiagnosis } from '@/features/admin/hooks/useUserDiagnosis';

const answer = (byAction: Record<string, unknown>) => {
  invoke.mockImplementation(async (payload: { action: string }) => (
    payload.action in byAction ? { data: byAction[payload.action] } : { error: `no ${payload.action}` }
  ));
};

describe('Activity log page', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('says who did what, including the group sync and the command line', async () => {
    answer({
      'audit.list': {
        hasMore: false,
        entries: [
          {
            id: 3, createdAt: '2026-11-09T12:00:00Z', action: 'groups.roleChanged', actorId: null, actorName: null,
            workspaceId: 'w1', workspaceName: 'North', targetUserId: 'u1', targetName: 'Anna',
            details: { via: 'groups', from: 'viewer', role: 'editor' },
          },
          {
            id: 2, createdAt: '2026-11-09T11:00:00Z', action: 'settings.update', actorId: null, actorName: null,
            workspaceId: null, workspaceName: null, targetUserId: null, targetName: null,
            details: { key: 'timeline.density', value: true, via: 'cli' },
          },
          {
            id: 1, createdAt: '2026-11-09T10:00:00Z', action: 'workspaces.removeMember', actorId: 'a1', actorName: 'Olga',
            workspaceId: 'w1', workspaceName: 'North', targetUserId: 'u2', targetName: 'Boris', details: {},
          },
        ],
      },
    });
    render(<AdminAuditPage />);
    expect(await screen.findByText('Changed the role of Anna: Viewer → Editor')).toBeInTheDocument();
    expect(screen.getByText('Keycloak groups')).toBeInTheDocument();
    expect(screen.getByText('Turned on: Timeline density')).toBeInTheDocument();
    expect(screen.getByText('Command line')).toBeInTheDocument();
    expect(screen.getByText('Removed Boris from the workspace')).toBeInTheDocument();
    expect(screen.getByText('Olga')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument();
  });
});

describe('Invitations page', () => {
  beforeEach(() => {
    invoke.mockReset();
    copyLink.mockReset();
    toastMock.success.mockReset();
  });

  const invitation = (id: string, email: string, expired: boolean) => ({
    id, workspaceId: 'w1', workspaceName: 'North', email, role: 'viewer', token: `tok-${id}`,
    createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-11-15T10:00:00Z', expired, invitedByName: 'Olga',
  });

  it('lists open invitations, copies a link and revokes after a confirmation', async () => {
    answer({
      'invites.list': { invitations: [invitation('i1', 'anna@example.com', false), invitation('i2', 'old@example.com', true)], truncated: false },
      'invites.revoke': { success: true, outcome: 'revoked' },
    });
    const user = userEvent.setup();
    render(<AdminInvitationsPage />);
    const annaRow = (await screen.findByText('anna@example.com')).closest('tr') as HTMLElement;
    const oldRow = screen.getByText('old@example.com').closest('tr') as HTMLElement;
    expect(within(oldRow).getByText('Expired')).toBeInTheDocument();
    expect(within(oldRow).queryByRole('button', { name: /Copy link/ })).not.toBeInTheDocument();

    await user.click(within(annaRow).getByRole('button', { name: /Copy link/ }));
    expect(copyLink).toHaveBeenCalledWith('tok-i1');

    await user.click(within(annaRow).getByRole('button', { name: 'Revoke' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith({ action: 'invites.revoke', inviteId: 'i1' }));
    await waitFor(() => expect(screen.queryByText('anna@example.com')).not.toBeInTheDocument());
  });
});

describe('Sign-in checks card', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('shows the providers and what needs attention', async () => {
    answer({
      'system.signIn': {
        checks: {
          realm: 'timeline',
          snapshot: {
            registrationAllowed: false, verifyEmail: true, resetPasswordAllowed: true, smtpConfigured: true,
            identityProviders: [{
              alias: 'authentik', displayName: 'Authentik', providerId: 'oidc', enabled: true, trustEmail: false,
              syncMode: 'FORCE', groupMappers: [{ name: 'groups', syncMode: 'INHERIT' }],
            }],
            workspacesFromGroups: true, superAdminFromGroups: false,
          },
          advice: [{ level: 'warning', code: 'trust_email_off', provider: 'authentik' }],
        },
      },
    });
    render(<AdminSignInChecks />);
    expect(await screen.findByText('Authentik')).toBeInTheDocument();
    expect(screen.getByText(/authentik: Trust Email is off/)).toBeInTheDocument();
    expect(screen.getByText('Sync mode: force')).toBeInTheDocument();
  });
});

describe('User card: sign-in', () => {
  const diagnosis: UserDiagnosis = {
    user: { id: 'u1', email: 'anna@example.com', createdAt: null, lastSignInAt: '2026-11-09T09:00:00Z' },
    workspaces: [{ id: 'w1', name: 'North', role: 'viewer' }],
    superAdminInTable: false,
    keycloak: {
      linked: true, error: null, found: true, enabled: true, emailVerified: false, requiredActions: ['VERIFY_EMAIL'],
      providers: [{ alias: 'authentik', userName: 'anna' }],
      groups: ['/Motio-IOPC'], groupsError: null,
      superAdmin: { direct: false, viaGroup: false, fromGroupsAllowed: false },
    },
    groupSync: {
      enabled: true,
      add: [],
      remove: [],
      changeRole: [{ workspaceName: 'North', from: 'viewer', role: 'editor' }],
      manualRoles: [],
    },
  };

  it('explains how the person signs in and what the groups would change', () => {
    render(<AdminUserSignInSection diagnosis={diagnosis} loading={false} error={null} locale="en" onReload={vi.fn()} />);
    expect(screen.getByText(/The address is not confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/VERIFY_EMAIL/)).toBeInTheDocument();
    expect(screen.getByText('authentik · anna')).toBeInTheDocument();
    expect(screen.getByText('/Motio-IOPC')).toBeInTheDocument();
    expect(screen.getByText('North: Viewer → Editor')).toBeInTheDocument();
    expect(screen.getByText('Not a super admin.')).toBeInTheDocument();
  });

  it('tells a password-only account apart', () => {
    render(
      <AdminUserSignInSection
        diagnosis={{ ...diagnosis, keycloak: { linked: false }, groupSync: { enabled: false } }}
        loading={false}
        error={null}
        locale="en"
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByText(/No Keycloak account linked/)).toBeInTheDocument();
  });
});
