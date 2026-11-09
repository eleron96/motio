import { describe, expect, it } from 'vitest';
import { signInAdvice, type SignInSnapshot } from '../../../infra/supabase/functions/_shared/signInChecks';

const authentik = {
  alias: 'authentik', displayName: 'Authentik', providerId: 'oidc', enabled: true, trustEmail: true, syncMode: 'FORCE',
  groupMappers: [{ name: 'groups', syncMode: 'INHERIT' }],
};

const snapshot = (overrides: Partial<SignInSnapshot> = {}): SignInSnapshot => ({
  registrationAllowed: false,
  verifyEmail: true,
  resetPasswordAllowed: true,
  smtpConfigured: true,
  identityProviders: [authentik],
  workspacesFromGroups: true,
  superAdminFromGroups: false,
  ...overrides,
});

const codes = (value: SignInSnapshot) => signInAdvice(value).map((advice) => `${advice.code}${advice.provider ? `:${advice.provider}` : ''}`);

describe('sign-in checks', () => {
  it('has nothing to say about a well set up provider', () => {
    expect(codes(snapshot())).toEqual([]);
  });

  it('warns that confirmation without a mail server blocks sign-up', () => {
    expect(codes(snapshot({ smtpConfigured: false }))).toContain('verify_without_smtp');
  });

  it('asks for Trust Email where addresses must be confirmed', () => {
    const value = snapshot({ identityProviders: [{ ...authentik, trustEmail: false }] });
    expect(codes(value)).toEqual(['trust_email_off:authentik']);
    expect(codes({ ...value, verifyEmail: false })).toEqual([]);
  });

  it('asks for Sync mode force on group mappers while groups decide access', () => {
    const value = snapshot({ identityProviders: [{ ...authentik, syncMode: 'IMPORT' }] });
    expect(codes(value)).toEqual(['groups_not_forced:authentik']);
    // A mapper of its own set to force is enough.
    expect(codes(snapshot({
      identityProviders: [{ ...authentik, syncMode: 'IMPORT', groupMappers: [{ name: 'groups', syncMode: 'FORCE' }] }],
    }))).toEqual([]);
    // Groups not used: nothing to say.
    expect(codes({ ...value, workspacesFromGroups: false })).toEqual([]);
  });

  it('notes when groups decide access but no provider brings groups', () => {
    expect(codes(snapshot({ identityProviders: [{ ...authentik, groupMappers: [] }] }))).toEqual(['no_group_mappers']);
  });

  it('ignores turned-off providers and mentions open sign-up', () => {
    const value = snapshot({
      registrationAllowed: true,
      identityProviders: [{ ...authentik, enabled: false, trustEmail: false }],
    });
    expect(codes(value)).toEqual(['registration_open']);
  });
});
