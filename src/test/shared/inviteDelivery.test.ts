import { describe, expect, it } from 'vitest';

import {
  planInvite,
  realmCanSendEmail,
  shouldEmailExistingAccount,
} from '../../../infra/supabase/functions/_shared/inviteDelivery';

describe('planInvite', () => {
  it('never creates an account for someone who already has one', () => {
    expect(planInvite({ hasAccount: true, realmCanSendEmail: true })).toBe('existing_account');
    expect(planInvite({ hasAccount: true, realmCanSendEmail: false })).toBe('existing_account');
  });

  it('creates an account and mails the set-up link only when the realm can send email', () => {
    expect(planInvite({ hasAccount: false, realmCanSendEmail: true })).toBe('new_account');
  });

  it('only records the invitation when nobody could receive a set-up email', () => {
    expect(planInvite({ hasAccount: false, realmCanSendEmail: false })).toBe('invite_only');
  });
});

describe('realmCanSendEmail', () => {
  it('needs both a host and a sender address', () => {
    expect(realmCanSendEmail({ host: 'smtp.example.com', from: 'motio@example.com', port: '587' })).toBe(true);
    // Keycloak's "Invalid sender address 'null'": a host without a sender.
    expect(realmCanSendEmail({ host: 'smtp.example.com' })).toBe(false);
    expect(realmCanSendEmail({ from: 'motio@example.com' })).toBe(false);
    expect(realmCanSendEmail({ host: '  ', from: 'motio@example.com' })).toBe(false);
  });

  it('is off for a realm without mail settings', () => {
    expect(realmCanSendEmail(null)).toBe(false);
    expect(realmCanSendEmail(undefined)).toBe(false);
    expect(realmCanSendEmail({})).toBe(false);
  });
});

describe('shouldEmailExistingAccount', () => {
  it('emails an enabled account when the realm can send email', () => {
    expect(shouldEmailExistingAccount({ realmCanSendEmail: true, accountEnabled: true })).toBe(true);
  });

  it('leaves a disabled account alone instead of switching it back on', () => {
    expect(shouldEmailExistingAccount({ realmCanSendEmail: true, accountEnabled: false })).toBe(false);
  });

  it('sends nothing without a mail server', () => {
    expect(shouldEmailExistingAccount({ realmCanSendEmail: false, accountEnabled: true })).toBe(false);
  });
});
