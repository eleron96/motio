import React, { useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '@lingui/macro';
import {
  Calendar,
  Calendar1,
  CalendarRange,
  ChartGantt,
  ChevronDown,
  FolderKanban,
  SlidersHorizontal,
  SquareKanban,
  Users,
} from 'lucide-react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isWeekViewEnabled } from '@/features/planner/lib/weekViewPreference';
import { usePlannerSurface } from '@/features/planner/hooks/usePlannerSurface';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useSheetDragDismiss } from '@/shared/hooks/useSheetDragDismiss';
import { cn } from '@/shared/lib/classNames';
import type { GroupMode } from '@/features/planner/types/planner';

type PlannerView = 'timeline' | 'calendar' | 'board';
type TimelineScale = 'day' | 'week';

/**
 * The planner's view state in the switcher's terms: first WHAT is shown
 * (timeline, calendar, board), then only the settings that view has — the
 * timeline's scale and rows. Nothing is ever shown disabled.
 */
const usePlannerViewState = () => {
  const { viewMode, setViewMode, setPlannerSurface, groupMode, setGroupMode } = usePlannerStore(useShallow((state) => ({
    viewMode: state.viewMode,
    setViewMode: state.setViewMode,
    setPlannerSurface: state.setPlannerSurface,
    groupMode: state.groupMode,
    setGroupMode: state.setGroupMode,
  })));
  const weekEnabled = useAuthStore((state) => isWeekViewEnabled(state.profilePreferences));
  const { surface, boardAvailable } = usePlannerSurface();

  const view: PlannerView = surface === 'board' ? 'board' : (viewMode === 'calendar' ? 'calendar' : 'timeline');
  const scale: TimelineScale = viewMode === 'week' && weekEnabled ? 'week' : 'day';

  // Coming back to the timeline from the calendar restores the scale it had.
  const lastScaleRef = useRef<TimelineScale>(scale);
  if (viewMode === 'day' || viewMode === 'week') lastScaleRef.current = scale;

  const selectView = (next: PlannerView) => {
    if (next === 'board') {
      setPlannerSurface('board');
      return;
    }
    setPlannerSurface('timeline');
    if (next === 'calendar') {
      setViewMode('calendar');
      return;
    }
    if (viewMode === 'calendar') {
      setViewMode(weekEnabled ? lastScaleRef.current : 'day');
    }
  };

  const selectScale = (next: TimelineScale) => {
    setPlannerSurface('timeline');
    setViewMode(next);
  };

  return {
    view,
    scale,
    groupMode,
    weekEnabled,
    boardAvailable,
    selectView,
    selectScale,
    selectGroup: (next: GroupMode) => setGroupMode(next),
  };
};

const VIEW_ICONS: Record<PlannerView, React.FC<{ className?: string }>> = {
  timeline: ChartGantt,
  calendar: Calendar,
  board: SquareKanban,
};

const viewLabel = (view: PlannerView) => {
  if (view === 'calendar') return t`Calendar`;
  if (view === 'board') return t`Board`;
  return t`Timeline`;
};

const SCALE_ICONS: Record<TimelineScale, React.FC<{ className?: string }>> = {
  day: Calendar1,
  week: CalendarRange,
};

const scaleLabel = (scale: TimelineScale) => (scale === 'week' ? t`Week` : t`Day`);
const groupLabel = (group: GroupMode) => (group === 'project' ? t`Projects` : t`People`);

type SlidingOption<K extends string> = {
  key: K;
  label: string;
  icon: React.FC<{ className?: string }>;
};

/**
 * A segmented pill whose highlight slides to the chosen item instead of
 * blinking from one button to another. Local to the switcher: the shared
 * SegmentedControl is used in many places and keeps its plain behaviour.
 */
function SlidingSegmented<K extends string>({
  options,
  value,
  onChange,
  tabbable = true,
}: {
  options: SlidingOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** False while the pill is folded away, so Tab skips its buttons. */
  tabbable?: boolean;
}) {
  const itemRefs = useRef(new Map<K, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // The first placement must not slide in from the left edge.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const button = itemRefs.current.get(value);
      if (!button) return;
      setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    };
    place();
    // Web fonts and label changes (language) resize the buttons after mount.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    itemRefs.current.forEach((button) => observer?.observe(button));
    return () => observer?.disconnect();
  }, [value, options.length]);

  useLayoutEffect(() => {
    if (indicator && !animate) {
      const frame = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [indicator, animate]);

  return (
    <div className="relative inline-flex items-center rounded-lg bg-muted p-0.5">
      {indicator && (
        <span
          aria-hidden
          className={cn(
            'absolute bottom-0.5 top-0.5 left-0 rounded-md bg-primary/15',
            animate && 'transition-[transform,width] duration-300 ease-out motion-reduce:transition-none',
          )}
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
      {options.map(({ key, label, icon: Icon }) => {
        const active = key === value;
        return (
          <button
            key={key}
            ref={(node) => {
              if (node) itemRefs.current.set(key, node);
              else itemRefs.current.delete(key);
            }}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            aria-label={label}
            tabIndex={tabbable ? undefined : -1}
            className={cn(
              'press relative z-10 inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-ui-xs font-medium transition-colors duration-300',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active ? 'text-primary' : 'text-foreground hover:text-primary/80',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Desktop: the view pill, then the timeline's own settings next to it. The
 * settings fold and unfold over the same 300ms instead of popping in and out,
 * so the view pill glides rather than jumping sideways.
 */
export const PlannerViewSwitcher: React.FC = () => {
  const state = usePlannerViewState();
  const views: PlannerView[] = state.boardAvailable ? ['timeline', 'calendar', 'board'] : ['timeline', 'calendar'];
  const showTimelineSettings = state.view === 'timeline';

  return (
    <div className="flex items-center">
      <SlidingSegmented
        options={views.map((view) => ({ key: view, label: viewLabel(view), icon: VIEW_ICONS[view] }))}
        value={state.view}
        onChange={state.selectView}
      />

      {/* 0fr ↔ 1fr animates the column, so the block folds to nothing. */}
      <div
        aria-hidden={!showTimelineSettings}
        className={cn(
          'grid transition-[grid-template-columns,opacity] duration-300 ease-out motion-reduce:transition-none',
          showTimelineSettings ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ gridTemplateColumns: showTimelineSettings ? '1fr' : '0fr' }}
        data-testid="timeline-view-settings"
      >
        <div className="flex min-w-0 items-center gap-3 overflow-hidden pl-3">
          <span aria-hidden className="h-5 w-px flex-shrink-0 bg-border" />
          {state.weekEnabled && (
            <SlidingSegmented
              options={(['day', 'week'] as const).map((scale) => ({
                key: scale,
                label: scaleLabel(scale),
                icon: SCALE_ICONS[scale],
              }))}
              value={state.scale}
              onChange={state.selectScale}
              tabbable={showTimelineSettings}
            />
          )}
          <SlidingSegmented
            options={[
              { key: 'assignee' as const, label: t`People`, icon: Users },
              { key: 'project' as const, label: t`Projects`, icon: FolderKanban },
            ]}
            value={state.groupMode}
            onChange={state.selectGroup}
            tabbable={showTimelineSettings}
          />
        </div>
      </div>
    </div>
  );
};

const OptionCard: React.FC<{
  active: boolean;
  onClick: () => void;
  icon?: React.FC<{ className?: string }>;
  label: string;
}> = ({ active, onClick, icon: Icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'press flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-sm transition-colors',
      active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-foreground',
    )}
  >
    {Icon && <Icon className="h-5 w-5" />}
    {label}
  </button>
);

/**
 * Phone: one "View" button whose label sums the current choice; it opens a
 * bottom sheet with large option cards. Three pills in a row did not fit the
 * phone header.
 */
export const MobilePlannerViewButton: React.FC = () => {
  const state = usePlannerViewState();
  const [open, setOpen] = useState(false);
  const drag = useSheetDragDismiss(() => setOpen(false));
  const views: PlannerView[] = state.boardAvailable ? ['timeline', 'calendar', 'board'] : ['timeline', 'calendar'];

  const summary = state.view === 'timeline'
    ? `${state.weekEnabled ? scaleLabel(state.scale) : viewLabel('timeline')} · ${groupLabel(state.groupMode)}`
    : viewLabel(state.view);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t`View`}
        className="press inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-foreground"
      >
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[11rem] truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          hideCloseButton
          className="gap-0 rounded-t-2xl p-0 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]"
          style={drag.style}
          {...drag.handlers}
        >
          <div className="pt-2">
            <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-border" />
            <SheetHeader className="px-4 pb-1 pt-3 text-left">
              <SheetTitle className="text-base font-semibold">{t`View`}</SheetTitle>
              <SheetDescription className="sr-only">{t`What the planner shows`}</SheetDescription>
            </SheetHeader>
          </div>

          <div className="space-y-4 px-4 pt-2">
            <div className={cn('grid gap-2', views.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {views.map((view) => (
                <OptionCard
                  key={view}
                  active={state.view === view}
                  onClick={() => state.selectView(view)}
                  icon={VIEW_ICONS[view]}
                  label={viewLabel(view)}
                />
              ))}
            </div>

            {state.view === 'timeline' && state.weekEnabled && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t`Scale`}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(['day', 'week'] as const).map((scale) => (
                    <OptionCard
                      key={scale}
                      active={state.scale === scale}
                      onClick={() => state.selectScale(scale)}
                      icon={SCALE_ICONS[scale]}
                      label={scaleLabel(scale)}
                    />
                  ))}
                </div>
              </section>
            )}

            {state.view === 'timeline' && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t`Rows`}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <OptionCard
                    active={state.groupMode === 'assignee'}
                    onClick={() => state.selectGroup('assignee')}
                    icon={Users}
                    label={t`People`}
                  />
                  <OptionCard
                    active={state.groupMode === 'project'}
                    onClick={() => state.selectGroup('project')}
                    icon={FolderKanban}
                    label={t`Projects`}
                  />
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
