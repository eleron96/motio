import React from 'react';
import { t } from '@lingui/macro';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import type { InviteOutcome } from '@/features/workspace/lib/inviteOutcome';

interface InviteResultNoticeProps {
  result: InviteOutcome;
  onCopyLink: (token: string) => void;
  className?: string;
}

/** After an invite: whether an email went out, and the link when it did not. */
export const InviteResultNotice: React.FC<InviteResultNoticeProps> = ({ result, onCopyLink, className }) => {
  const { email, token } = result;

  if (result.alreadyMember) {
    return (
      <Alert className={className}>
        <AlertTitle>{t`Already a member`}</AlertTitle>
        <AlertDescription>{t`${email} already has access to this workspace.`}</AlertDescription>
      </Alert>
    );
  }

  if (result.delivery === 'email') {
    return (
      <Alert className={className}>
        <AlertTitle>{t`Invitation sent`}</AlertTitle>
        <AlertDescription>
          {t`${email} will get an email with a link. The invitation also waits in their notifications in Motio.`}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className={className}>
      <AlertTitle>{t`Invitation created`}</AlertTitle>
      <AlertDescription>
        <div>
          {t`No email was sent. ${email} will see the invitation in their notifications after signing in to Motio with this address. You can also send them the link.`}
        </div>
        {token && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => onCopyLink(token)}
          >
            {t`Copy link`}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
