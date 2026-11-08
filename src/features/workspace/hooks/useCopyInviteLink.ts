import { useCallback } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { buildInviteLink } from '@/features/workspace/lib/inviteOutcome';

/**
 * Copies an invitation link, for people who get no email: the install has no
 * mail server, or the email failed. Only the invited address can accept it.
 */
export const useCopyInviteLink = () => useCallback(async (token: string) => {
  const link = buildInviteLink(window.location.origin, token);
  try {
    if (!navigator.clipboard) throw new Error('Clipboard is not available.');
    await navigator.clipboard.writeText(link);
    toast.success(t`Invitation link copied`);
  } catch {
    // Plain http (a server behind a proxy without TLS) has no clipboard API.
    window.prompt(t`Copy the invitation link`, link);
  }
}, []);
