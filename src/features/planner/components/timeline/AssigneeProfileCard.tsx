import React from 'react';
import { UserAvatar } from '@/shared/ui/UserAvatar';

interface AssigneeProfileCardProps {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  colorSeed: string;
  initials: string;
}

/**
 * Popover body shown when an assignee avatar on the timeline is clicked:
 * a large photo (or monogram) with the person's name and email underneath.
 * Rendered inside a PopoverContent — layout only, no open/close logic here.
 */
export const AssigneeProfileCard: React.FC<AssigneeProfileCardProps> = ({
  name,
  email,
  avatarUrl,
  colorSeed,
  initials,
}) => (
  <div className="flex flex-col items-center gap-3 text-center">
    <UserAvatar
      size="profile"
      initials={initials}
      avatarUrl={avatarUrl}
      colorSeed={colorSeed}
      className="shadow-sm ring-1 ring-border/60"
    />
    <div className="flex min-w-0 max-w-full flex-col gap-0.5">
      <span className="break-words font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
        {name}
      </span>
      {email && (
        <a
          href={`mailto:${email}`}
          className="break-all text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {email}
        </a>
      )}
    </div>
  </div>
);
