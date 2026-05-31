import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { t } from '@lingui/macro';
import { Folder, GanttChart, LayoutGrid, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import {
  getAppNavigationItems,
  type AppNavigationItem,
  type SectionIconKey,
} from '@/features/workspace/lib/appNavigation';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';

const SECTION_ICONS: Record<SectionIconKey, LucideIcon> = {
  timeline: GanttChart,
  dashboard: LayoutGrid,
  projects: Folder,
  team: Users,
};

interface WorkspaceNavProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  onNavigate?: () => void;
}

type Rect = { left: number; top: number; width: number; height: number };

const computeActiveTo = (items: AppNavigationItem[], pathname: string): string | null => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const match = items.find((item) =>
    item.end ? normalized === item.to : normalized === item.to || normalized.startsWith(`${item.to}/`),
  );
  return match?.to ?? null;
};

const dataTourFor = (to: string, basePath: string) => {
  if (to === `${basePath}/dashboard`) return 'nav-dashboard';
  if (to === `${basePath}/projects`) return 'nav-projects';
  if (to === `${basePath}/members`) return 'nav-team';
  return undefined;
};

interface NavBodyProps {
  items: AppNavigationItem[];
  basePath: string;
  onNavigate?: () => void;
}

/**
 * Horizontal segmented control with a single black "thumb" capsule that
 * physically slides between tabs. The thumb is an absolutely-positioned
 * element behind the labels; on section change we re-measure the active tab
 * and animate the thumb's left/width with a springy easing. The labels stay
 * put; only the underlay moves. Relies on the header being persistent (see
 * WorkspaceLayout) so this component does not remount between sections.
 */
const HorizontalNav: React.FC<NavBodyProps> = ({ items, basePath, onNavigate }) => {
  const { pathname } = useLocation();
  const activeTo = computeActiveTo(items, pathname);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [thumb, setThumb] = useState<Rect | null>(null);
  const [animate, setAnimate] = useState(false);

  const measureActive = (): Rect | null => {
    const el = activeTo ? itemRefs.current[activeTo] : null;
    if (!el) return null;
    return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
  };

  // Position the thumb under the active tab before paint. When the active tab
  // changes (and the transition is enabled), the left/width change animates.
  useLayoutEffect(() => {
    const rect = measureActive();
    if (rect) setThumb(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTo]);

  // Enable the slide only after the first placement, so the thumb doesn't
  // animate in from the corner when the bar first mounts.
  useEffect(() => {
    if (!thumb || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [thumb, animate]);

  // Keep the thumb aligned when the bar resizes (locale change, layout shifts).
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const rect = measureActive();
      if (rect) setThumb(rect);
    });
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTo]);

  return (
    <div ref={listRef} className="relative inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      <span
        aria-hidden="true"
        className={cn(
          'seg-thumb pointer-events-none absolute rounded-md bg-foreground shadow-sm',
          animate && 'transition-[left,width] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        )}
        style={
          thumb
            ? { left: thumb.left, top: thumb.top, width: thumb.width, height: thumb.height }
            : { opacity: 0 }
        }
      />
      {items.map((item) => {
        const Icon = SECTION_ICONS[item.iconKey];
        const isActive = item.to === activeTo;
        return (
          <NavLink
            key={item.to}
            ref={(el) => {
              itemRefs.current[item.to] = el;
            }}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            data-tour={dataTourFor(item.to, basePath)}
            className={cn(
              'relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-ui-sm font-medium transition-colors duration-200',
              // Whitening is delayed so the label turns white roughly as the
              // sliding thumb arrives underneath it, not before.
              isActive
                ? 'text-background [transition-delay:120ms]'
                : 'text-foreground/80 hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
};

/** Vertical stacked variant (no sliding thumb). */
const VerticalNav: React.FC<NavBodyProps> = ({ items, basePath, onNavigate }) => (
  <div className="flex flex-col items-start gap-1">
    {items.map((item) => {
      const Icon = SECTION_ICONS[item.iconKey];
      return (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          data-tour={dataTourFor(item.to, basePath)}
          className={({ isActive }) =>
            cn(
              'inline-flex h-8 w-full items-center gap-1.5 rounded-md px-3 text-ui-sm font-medium transition-colors duration-200',
              isActive ? 'bg-foreground text-background' : 'text-foreground/80 hover:text-foreground',
            )
          }
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
          {item.label}
        </NavLink>
      );
    })}
  </div>
);

export const WorkspaceNav: React.FC<WorkspaceNavProps> = ({
  orientation = 'horizontal',
  className,
  onNavigate,
}) => {
  const basePath = useAppBasePath();
  const items = getAppNavigationItems(basePath);

  return (
    <nav data-tour="nav-bar" aria-label={t`Workspace sections`} className={className}>
      {orientation === 'horizontal' ? (
        <HorizontalNav items={items} basePath={basePath} onNavigate={onNavigate} />
      ) : (
        <VerticalNav items={items} basePath={basePath} onNavigate={onNavigate} />
      )}
    </nav>
  );
};
