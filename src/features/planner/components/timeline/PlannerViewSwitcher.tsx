import React, { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '@lingui/macro';
import {
  Calendar,
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
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
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

const scaleLabel = (scale: TimelineScale) => (scale === 'week' ? t`Week` : t`Day`);
const groupLabel = (group: GroupMode) => (group === 'project' ? t`Projects` : t`People`);

/** Desktop: the view pill, then the timeline's own settings next to it. */
export const PlannerViewSwitcher: React.FC = () => {
  const state = usePlannerViewState();
  const views: PlannerView[] = state.boardAvailable ? ['timeline', 'calendar', 'board'] : ['timeline', 'calendar'];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <SegmentedControl surface="compact">
        {views.map((view) => {
          const Icon = VIEW_ICONS[view];
          return (
            <SegmentedControlItem
              key={view}
              active={state.view === view}
              className="gap-1.5"
              onClick={() => state.selectView(view)}
              aria-label={viewLabel(view)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{viewLabel(view)}</span>
            </SegmentedControlItem>
          );
        })}
      </SegmentedControl>

      {state.view === 'timeline' && (
        <>
          <span aria-hidden className="h-5 w-px bg-border" />
          {state.weekEnabled && (
            <SegmentedControl surface="compact">
              {(['day', 'week'] as const).map((scale) => (
                <SegmentedControlItem
                  key={scale}
                  active={state.scale === scale}
                  onClick={() => state.selectScale(scale)}
                >
                  {scaleLabel(scale)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          )}
          <SegmentedControl surface="compact">
            <SegmentedControlItem
              active={state.groupMode === 'assignee'}
              className="gap-1.5"
              onClick={() => state.selectGroup('assignee')}
              aria-label={t`People`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{t`People`}</span>
            </SegmentedControlItem>
            <SegmentedControlItem
              active={state.groupMode === 'project'}
              className="gap-1.5"
              onClick={() => state.selectGroup('project')}
              aria-label={t`Projects`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span>{t`Projects`}</span>
            </SegmentedControlItem>
          </SegmentedControl>
        </>
      )}
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
