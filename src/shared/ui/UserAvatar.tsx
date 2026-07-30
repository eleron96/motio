import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/ui/avatar';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { toMonogramColor } from '@/shared/lib/personColor';
import { getPersonMonogram } from '@/shared/domain/personName';
import { cn } from '@/shared/lib/classNames';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'xl' | '2xl' | 'lg' | 'profile';

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  xl: 'h-11 w-11 text-sm',
  '2xl': 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-lg',
  profile: 'h-28 w-28 text-2xl',
};

// Text size inside the initials overlay strip.
const overlayTextSize: Record<AvatarSize, string> = {
  xs: 'text-[7px] leading-none',
  sm: 'text-[8px] leading-none',
  md: 'text-[9px] leading-none',
  xl: 'text-[10px] leading-none',
  '2xl': 'text-[11px] leading-none',
  lg: 'text-xs leading-none',
  profile: 'text-sm leading-none',
};

// Height of the gradient strip — tall enough that the gradient is visible
// above the text, yet small enough not to obscure the photo.
const overlayHeight: Record<AvatarSize, string> = {
  xs: 'h-[10px]',
  sm: 'h-[12px]',
  md: 'h-[13px]',
  xl: 'h-[16px]',
  '2xl': 'h-[20px]',
  lg: 'h-[28px]',
  profile: 'h-[36px]',
};

interface UserAvatarProps {
  /** Public URL of the uploaded photo, if any */
  avatarUrl?: string | null;
  /**
   * Person's display name (or email). Used to derive the monogram initials and
   * the fallback color when `initials` is not given — this is the simplest way
   * to use the component: `<UserAvatar name={person.name} avatarUrl={...} />`.
   */
  name?: string | null;
  /** Explicit 1–2 letter initials; overrides the name-derived monogram. */
  initials?: string;
  /** Seed for deterministic monogram background color (defaults to name/initials) */
  colorSeed?: string;
  /**
   * Colour this person picked in workspace settings (#rrggbb). Takes precedence
   * over the id-hashed seed colour, converted to monogram density first so the
   * white initials stay readable — see shared/lib/personColor.
   */
  color?: string | null;
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
  name,
  initials,
  colorSeed = '',
  color,
  size = 'md',
  className,
  showInitialsOverlay = false,
}) => {
  const resolvedInitials = initials ?? getPersonMonogram(name, '?');
  const bgColor = toMonogramColor(color)
    ?? getMonogramColor(colorSeed || name || resolvedInitials);
  const hasPhoto = Boolean(avatarUrl);

  return (
    // key forces Radix Avatar to remount when the URL changes so that the
    // internal imageLoadingStatus resets — without this, removing AvatarImage
    // from the DOM leaves status === 'loaded' and AvatarFallback never renders.
    // 'isolate' forces the Avatar to create its own stacking context so that
    // overflow-hidden + border-radius correctly clips absolutely-positioned
    // children in Chrome/Safari (without it, z-indexed children escape the
    // rounded clip and render as a rectangle).
    <Avatar key={avatarUrl ?? 'no-photo'} className={cn(sizeClasses[size], 'relative isolate', className)}>
      {hasPhoto && (
        <AvatarImage
          src={avatarUrl!}
          alt={resolvedInitials}
          className="object-cover"
        />
      )}
      <AvatarFallback
        className="font-semibold text-white"
        style={{ backgroundColor: bgColor }}
      >
        {resolvedInitials}
      </AvatarFallback>

      {/* Initials overlay — only when a real photo is displayed */}
      {hasPhoto && showInitialsOverlay && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-center pb-[2px]',
            'bg-gradient-to-t from-black/60 to-transparent',
            overlayHeight[size],
            overlayTextSize[size],
            'font-semibold tracking-wide text-white drop-shadow-sm',
          )}
        >
          {resolvedInitials}
        </span>
      )}
    </Avatar>
  );
};
