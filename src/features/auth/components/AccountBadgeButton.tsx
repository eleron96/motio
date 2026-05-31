import React from 'react';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';
import { cn } from '@/shared/lib/classNames';
import { Button } from '@/shared/ui/button';
import { UserAvatar } from '@/shared/ui/UserAvatar';

interface AccountBadgeButtonProps {
  onClick: () => void;
  className?: string;
}

export const AccountBadgeButton: React.FC<AccountBadgeButtonProps> = ({ onClick, className }) => {
  const user = useAuthStore((state) => state.user);
  const profileDisplayName = useAuthStore((state) => state.profileDisplayName);
  const profileAvatarUrl = useAuthStore((state) => state.profileAvatarUrl);
  const signedInLabel = getAccountSignedInLabel(user, t`Unknown user`);
  const initials = getAccountInitials(profileDisplayName, signedInLabel);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn('h-[34px] w-[34px] rounded-full p-0', className)}
      aria-label={t`Account settings`}
      title={signedInLabel}
    >
      <UserAvatar
        avatarUrl={profileAvatarUrl}
        initials={initials}
        colorSeed={user?.id}
        size="md"
        className="h-full w-full"
      />
    </Button>
  );
};
