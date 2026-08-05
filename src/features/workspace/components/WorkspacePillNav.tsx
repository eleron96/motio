import React from 'react';
import { NavLink, useMatch, useResolvedPath } from 'react-router-dom';
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
      className={cn('flex w-full items-center px-3 py-2', className)}
      style={{ gap: GAP }}
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
