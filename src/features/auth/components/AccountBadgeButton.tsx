import React from 'react';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';
import { cn } from '@/shared/lib/classNames';
import { Button } from '@/shared/ui/button';

interface AccountBadgeButtonProps {
  onClick: () => void;
  className?: string;
}

export const AccountBadgeButton: React.FC<AccountBadgeButtonProps> = ({ onClick, className }) => {
  const user = useAuthStore((state) => state.user);
  const profileDisplayName = useAuthStore((state) => state.profileDisplayName);
  const signedInLabel = getAccountSignedInLabel(user, t`Unknown user`);
  const initials = getAccountInitials(profileDisplayName, signedInLabel);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn('h-9 w-9 rounded-full p-0', className)}
      aria-label={t`Account settings`}
      title={signedInLabel}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {initials}
      </span>
    </Button>
  );
};
