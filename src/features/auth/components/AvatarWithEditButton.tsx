import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { AvatarEditModal } from './AvatarEditModal';
import { t } from '@lingui/macro';

interface AvatarWithEditButtonProps {
  userId: string;
  avatarUrl: string | null;
  initials: string;
  onAvatarChange: (url: string | null) => void;
  disabled?: boolean;
}

export const AvatarWithEditButton: React.FC<AvatarWithEditButtonProps> = ({
  userId,
  avatarUrl,
  initials,
  onAvatarChange,
  disabled = false,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="relative inline-block">
        <PersonAvatar
          userId={userId}
          avatarUrl={avatarUrl}
          initials={initials}
          colorSeed={userId}
          size="lg"
        />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute -right-1 -top-1 h-6 w-6 rounded-full shadow-sm"
          onClick={() => setModalOpen(true)}
          disabled={disabled}
          aria-label={t`Edit photo`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>

      <AvatarEditModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        userId={userId}
        currentAvatarUrl={avatarUrl}
        onAvatarChange={onAvatarChange}
      />
    </>
  );
};
