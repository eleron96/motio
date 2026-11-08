// How a workspace invitation reaches the person. Pure rules, unit-tested from
// vitest (src/test/shared/inviteDelivery.test.ts); the invite function does the I/O.
//
// The invitation itself is a row in workspace_invites: whoever signs in with
// that email sees it in Motio's notifications and can accept it there. The
// email from Keycloak is a way to bring the person in, not the invitation.

export type InvitePlan =
  /** They already have an account. It is never changed by an invitation. */
  | "existing_account"
  /** No account and the realm can send email: an account is created and Keycloak mails the set-up link. */
  | "new_account"
  /**
   * No account and the realm cannot send email: nothing is created. The person
   * signs in with this email (their company sign-in, or registration) and
   * accepts in Motio, or follows the link the admin sends them.
   */
  | "invite_only";

export type InviteDelivery = "email" | "in_app";

export const planInvite = (input: { hasAccount: boolean; realmCanSendEmail: boolean }): InvitePlan => {
  if (input.hasAccount) return "existing_account";
  return input.realmCanSendEmail ? "new_account" : "invite_only";
};

/**
 * Keycloak mails from the SMTP account in the realm settings; without a host
 * and a sender address every email fails ("Invalid sender address 'null'").
 */
export const realmCanSendEmail = (smtpServer: Record<string, unknown> | null | undefined): boolean => {
  const host = smtpServer?.host;
  const from = smtpServer?.from;
  return typeof host === "string" && host.trim() !== "" && typeof from === "string" && from.trim() !== "";
};

/**
 * Whether to email someone who already has an account. A disabled account is
 * left alone: inviting a person must not switch their account back on (an
 * administrator blocked it), and Keycloak refuses to mail a disabled user anyway.
 */
export const shouldEmailExistingAccount = (input: {
  realmCanSendEmail: boolean;
  accountEnabled: boolean;
}): boolean => input.realmCanSendEmail && input.accountEnabled;
