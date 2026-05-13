import React from 'react';
import { NavLink, useMatch, useResolvedPath } from 'react-router-dom';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
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
  onOpenDrawer: () => void;
  hasNotification?: boolean;
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
  onOpenDrawer,
  className,
}) => {
  const basePath = useAppBasePath();
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
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label={t`Open menu`}
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
        style={{ width: ROUND, height: ROUND }}
      >
        <img
          src="/favicon-theme-light.png"
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
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
