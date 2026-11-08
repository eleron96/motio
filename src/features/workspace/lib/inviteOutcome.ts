import type { InviteDelivery } from '@/features/auth/store/authStore.contract';

/** What an admin sees after inviting someone. */
export interface InviteOutcome {
  email: string;
  /** email: Keycloak sent the link; in_app: it waits in their notifications in Motio. */
  delivery: InviteDelivery;
  /** For "copy link" when no email went out. */
  token: string | null;
  alreadyMember: boolean;
}

export const toInviteOutcome = (
  result: {
    inviteEmail?: string;
    delivery?: InviteDelivery;
    inviteToken?: string;
    alreadyMember?: boolean;
  },
  typedEmail: string,
): InviteOutcome => ({
  email: result.inviteEmail ?? typedEmail.trim(),
  // Functions from before delivery existed only answered once the email was sent.
  delivery: result.delivery ?? 'email',
  token: result.inviteToken ?? null,
  alreadyMember: result.alreadyMember === true,
});

/** The page that accepts an invitation (InvitePage). */
export const buildInviteLink = (origin: string, token: string) =>
  `${origin.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`;
