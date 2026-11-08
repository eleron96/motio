import { useCallback } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { buildInviteLink } from '@/features/workspace/lib/inviteOutcome';

// The older way to copy: select a hidden field and copy the selection. It works
// on plain http (a server behind a proxy without TLS has no clipboard API) and
// in embedded browsers that refuse the clipboard API.
const copyBySelection = (text: string) => {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
};

/**
 * Copies an invitation link, for people who get no email: the install has no
 * mail server, or the email failed. Only the invited address can accept it.
 * Where nothing can be copied, the link is shown to copy by hand.
 */
export const useCopyInviteLink = () => useCallback(async (token: string) => {
  const link = buildInviteLink(window.location.origin, token);
  let copied = false;
  try {
    if (!navigator.clipboard) throw new Error('Clipboard is not available.');
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    copied = copyBySelection(link);
  }
  if (copied) {
    toast.success(t`Invitation link copied`);
    return;
  }
  toast(t`Copy the invitation link`, {
    description: link,
    duration: 30_000,
    classNames: { description: 'select-all break-all' },
  });
}, []);
