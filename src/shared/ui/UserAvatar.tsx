import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/ui/avatar';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { cn } from '@/shared/lib/classNames';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-20 w-20 text-lg',
};

// Height of the initials overlay strip as a fraction of the circle diameter.
// Kept small so the photo is still the main focus.
const overlayTextSize: Record<AvatarSize, string> = {
  xs: 'text-[7px] leading-[10px]',
  sm: 'text-[8px] leading-[11px]',
  md: 'text-[9px] leading-[12px]',
  lg: 'text-xs leading-4',
};

interface UserAvatarProps {
  /** Public URL of the uploaded photo, if any */
  avatarUrl?: string | null;
  /** 1–2 letter initials shown when no photo */
  initials: string;
  /** Seed for deterministic monogram background color (typically userId) */
  colorSeed?: string;
  size?: AvatarSize;
  className?: string;
  /**
   * When true and a photo is present, renders a semi-transparent gradient
   * strip at the bottom of the circle with white initials so the person can
   * be identified even from an unfamiliar photo.
   * Has no effect when the monogram fallback is shown (initials are already
   * the primary content).
   */
  showInitialsOverlay?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  initials,
  colorSeed = '',
  size = 'md',
  className,
  showInitialsOverlay = false,
}) => {
  const bgColor = getMonogramColor(colorSeed || initials);
  const hasPhoto = Boolean(avatarUrl);

  return (
    <Avatar className={cn(sizeClasses[size], 'relative', className)}>
      {hasPhoto && (
        <AvatarImage
          src={avatarUrl!}
          alt={initials}
          className="object-cover"
        />
      )}
      <AvatarFallback
        className="font-semibold text-white"
        style={{ backgroundColor: bgColor }}
      >
        {initials}
      </AvatarFallback>

      {/* Initials overlay — only when a real photo is displayed */}
      {hasPhoto && showInitialsOverlay && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-center pb-[2px]',
            'bg-gradient-to-t from-black/55 to-transparent',
            overlayTextSize[size],
            'font-semibold tracking-wide text-white',
          )}
        >
          {initials}
        </span>
      )}
    </Avatar>
  );
};
