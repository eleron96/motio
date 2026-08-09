import React, { useEffect, useState } from 'react';
import { UserAvatar } from '@/shared/ui/UserAvatar';

interface AssigneeProfileCardProps {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  colorSeed: string;
  /** Colour picked in workspace settings; null keeps the id-hashed monogram. */
  color?: string | null;
  initials: string;
}

/** Upper bound on a large desktop — beyond this the popover stops reading as a card. */
const MAX_AVATAR_PX = 400;
/** Floor, so a small or slow-to-measure photo still opens noticeably bigger. */
const MIN_AVATAR_PX = 176;

/**
 * How far past its own pixels a photo may be stretched. Stored avatars are
 * 512×512, which is 512 CSS px on a normal screen but only 256 on a 2× retina
 * panel — holding the line at 1.0 would leave retina users with a barely
 * bigger picture. 1.5× stays visually clean on a photograph; raising
 * MAX_SIZE in avatarStorage.ts is what would buy a genuinely sharper one.
 */
const UPSCALE_TOLERANCE = 1.5;

/**
 * Largest size the photo can fill before it visibly softens, derived from its
 * own resolution and the screen's pixel density.
 */
const useResolutionCap = (avatarUrl: string | null): number | null => {
  const [cap, setCap] = useState<number | null>(null);

  useEffect(() => {
    if (!avatarUrl) {
      setCap(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      setCap((image.naturalWidth / ratio) * UPSCALE_TOLERANCE);
    };
    image.src = avatarUrl;
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  return cap;
};

/**
 * Popover body shown when an assignee avatar on the timeline is clicked:
 * a large photo (or monogram) with the person's name and email underneath.
 * Rendered inside a PopoverContent — layout only, no open/close logic here.
 *
 * The photo scales with the viewport (so a phone never gets a popover wider
 * than the screen and a desktop gets a genuinely large picture) and is capped
 * by its own pixel resolution.
 */
export const AssigneeProfileCard: React.FC<AssigneeProfileCardProps> = ({
  name,
  email,
  avatarUrl,
  colorSeed,
  color,
  initials,
}) => {
  const resolutionCap = useResolutionCap(avatarUrl);
  // A monogram is drawn text, so nothing blurs — it may take the full size.
  const capPx = Math.round(
    Math.min(MAX_AVATAR_PX, Math.max(MIN_AVATAR_PX, resolutionCap ?? MAX_AVATAR_PX)),
  );

  return (
    <div
      className="flex flex-col items-center gap-3 text-center"
      style={{ '--assignee-avatar': `min(${capPx}px, 74vw, 46vh)` } as React.CSSProperties}
    >
      <UserAvatar
        size="profile"
        initials={initials}
        avatarUrl={avatarUrl}
        colorSeed={colorSeed}
        color={color}
        className={
          'h-[var(--assignee-avatar)] w-[var(--assignee-avatar)]'
          + ' text-[length:calc(var(--assignee-avatar)*0.32)]'
          + ' shadow-sm ring-1 ring-border/60'
        }
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
};
