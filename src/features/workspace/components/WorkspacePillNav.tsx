import React from 'react';
import { NavLink, useLocation, useMatch, useNavigate, useResolvedPath } from 'react-router-dom';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { useAuthStore } from '@/features/auth/store/authStore';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import {
  getAppNavigationItems,
  type AppNavigationItem,
  type SectionIconKey,
} from '@/features/workspace/lib/appNavigation';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';
import {
  TimelineNavIcon,
  DashboardNavIcon,
  ProjectsNavIcon,
  TeamNavIcon,
} from '@/features/workspace/components/sectionNavIcons';

const SECTION_ICONS: Record<SectionIconKey, React.FC<{ size?: number; className?: string }>> = {
  timeline: TimelineNavIcon,
  dashboard: DashboardNavIcon,
  projects: ProjectsNavIcon,
  team: TeamNavIcon,
};

const ROUND = 40;
const ICON_SIZE = 18;
const GAP = 6;
/** Movement before a touch on the header counts as a swipe rather than a tap. */
const SWIPE_START_PX = 16;
/** Horizontal travel that commits a section switch. */
const SWIPE_COMMIT_PX = 56;
const PILL_PADDING_LEFT = 12;
const PILL_PADDING_RIGHT = 14;
const PILL_ICON_GAP = 6;
const TRANSITION = 'width 320ms cubic-bezier(.4,.8,.3,1.05), padding 320ms cubic-bezier(.4,.8,.3,1.05), background-color 200ms ease, color 200ms ease';

interface WorkspacePillNavProps {
  onOpenMenu: () => void;
  /** Unread invites + task notifications, shown as a badge on the avatar. */
  unreadCount?: number;
  className?: string;
}

interface PillButtonProps {
  item: AppNavigationItem;
  width: number;
}

const PillButton: React.FC<PillButtonProps> = ({ item, width }) => {
  const resolvedPath = useResolvedPath(item.to);
  const isActive = Boolean(useMatch({ end: item.end, path: resolvedPath.pathname }));
  const Icon = SECTION_ICONS[item.iconKey];

  const targetWidth = isActive ? ROUND + PILL_ICON_GAP + PILL_PADDING_RIGHT + width : ROUND;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={item.label}
      className={cn(
        'inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-full text-ui-sm font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isActive
          ? 'bg-foreground text-background justify-start'
          : 'bg-muted text-foreground hover:bg-muted/80 justify-center',
      )}
      style={{
        height: ROUND,
        width: targetWidth,
        paddingLeft: isActive ? PILL_PADDING_LEFT : 0,
        paddingRight: isActive ? PILL_PADDING_RIGHT : 0,
        gap: PILL_ICON_GAP,
        transition: TRANSITION,
      }}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <Icon size={ICON_SIZE} />
      </span>
      {isActive ? <span className="leading-none">{item.label}</span> : null}
    </NavLink>
  );
};

export const WorkspacePillNav: React.FC<WorkspacePillNavProps> = ({
  onOpenMenu,
  unreadCount = 0,
  className,
}) => {
  const basePath = useAppBasePath();
  const user = useAuthStore((state) => state.user);
  const profileDisplayName = useAuthStore((state) => state.profileDisplayName);
  const profileAvatarUrl = useAuthStore((state) => state.profileAvatarUrl);
  const initials = getAccountInitials(
    profileDisplayName,
    getAccountSignedInLabel(user, t`Unknown user`),
  );
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);
  const items = React.useMemo(() => getAppNavigationItems(basePath), [basePath]);
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const [labelWidths, setLabelWidths] = React.useState<Record<string, number>>({});

  // Swiping the header left/right walks the sections in order — the same
  // mental model as the pill row itself, just without aiming for a pill.
  const navigate = useNavigate();
  const location = useLocation();
  const activeIndex = React.useMemo(() => {
    const normalized = location.pathname.replace(/\/+$/, '') || '/';
    return items.findIndex((item) => (
      item.end
        ? normalized === item.to
        : normalized === item.to || normalized.startsWith(`${item.to}/`)
    ));
  }, [items, location.pathname]);

  const gestureRef = React.useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    dx: number;
    dragging: boolean;
  } | null>(null);
  // A committed swipe must not also fire the click of whatever pill the finger
  // happened to land on.
  const swallowClickRef = React.useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swallowClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      dx: 0,
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.x0;
    const dy = event.clientY - gesture.y0;

    if (!gesture.dragging) {
      if (Math.abs(dx) < SWIPE_START_PX && Math.abs(dy) < SWIPE_START_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        gestureRef.current = null;
        return;
      }
      gesture.dragging = true;
      // Not implemented in jsdom, and absent on some older mobile engines.
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    gesture.dx = dx;
    if (Math.abs(dx) > SWIPE_START_PX) swallowClickRef.current = true;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture && gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!gesture?.dragging || activeIndex < 0) return;
    if (Math.abs(gesture.dx) < SWIPE_COMMIT_PX) return;

    // Finger left = content moves left = next section.
    const next = activeIndex + (gesture.dx < 0 ? 1 : -1);
    if (next < 0 || next >= items.length) return;
    navigate(items[next].to);
  };

  const handlePointerCancel = () => {
    gestureRef.current = null;
    swallowClickRef.current = false;
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  React.useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const next: Record<string, number> = {};
    Array.from(node.children).forEach((el) => {
      const span = el as HTMLElement;
      const id = span.dataset.id;
      if (id) next[id] = span.offsetWidth;
    });
    setLabelWidths((prev) => {
      const same = Object.keys(next).every((k) => prev[k] === next[k])
        && Object.keys(prev).length === Object.keys(next).length;
      return same ? prev : next;
    });
  }, [items]);

  return (
    <div
      data-tour="nav-bar"
      data-testid="mobile-pill-nav"
      className={cn('flex w-full items-center px-3 py-2', className)}
      // pan-y keeps any vertical intent native; horizontal drags are ours.
      style={{ gap: GAP, touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
    >
      {/*
        The user's own avatar opens the menu — it doubles as the account entry
        point and carries the unread badge, so the phone header needs no separate
        bell or account button.
      */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t`Open menu`}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center rounded-full',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
        style={{ width: ROUND, height: ROUND }}
      >
        <PersonAvatar
          userId={user?.id}
          avatarUrl={profileAvatarUrl}
          initials={initials}
          colorSeed={user?.id}
          size="md"
        />
        {unreadCount > 0 && (
          <>
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-card"
              aria-hidden="true"
            >
              {badgeLabel}
            </span>
            {/* The visible badge caps at 9+; the exact count is for the reader. */}
            <span className="sr-only">{t`Unread notifications`}: {unreadCount}</span>
          </>
        )}
      </button>

      <div className="ml-auto flex items-center" style={{ gap: GAP }}>
        {items.map((item) => (
          <PillButton key={item.to} item={item} width={labelWidths[item.to] ?? 60} />
        ))}
      </div>

      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap text-ui-sm font-semibold"
        style={{ left: -9999, top: -9999 }}
      >
        {items.map((item) => (
          <span key={item.to} data-id={item.to}>{item.label}</span>
        ))}
      </div>
    </div>
  );
};
