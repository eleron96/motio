import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TimelineGrid } from '@/features/planner/components/timeline/TimelineGrid';
import { CalendarTimeline } from '@/features/planner/components/timeline/CalendarTimeline';
import { TimelineControls } from '@/features/planner/components/timeline/TimelineControls';
import { FilterPanel } from '@/features/planner/components/FilterPanel';
import { TaskDetailPanel } from '@/features/planner/components/TaskDetailPanel';
import { PushDeepLink } from '@/features/planner/components/PushDeepLink';
import { AddTaskDialog } from '@/features/planner/components/AddTaskDialog';
import { isTimeOffEnabled } from '@/shared/lib/featureFlags';
import { usePlannerLiveSync } from '@/features/planner/hooks/usePlannerLiveSync';
import { useTaskUndoToasts } from '@/features/planner/hooks/useTaskUndoToasts';
import { useRevealPendingTask } from '@/features/planner/hooks/useRevealPendingTask';
import { Button } from '@/shared/ui/button';
import { Filter, Plus, SquarePen } from 'lucide-react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isWeekViewEnabled } from '@/features/planner/lib/weekViewPreference';
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { WorkspaceCommonDialogs } from '@/features/workspace/components/WorkspaceCommonDialogs';
import { Filters, ViewMode } from '@/features/planner/types/planner';
import { format } from 'date-fns';
import { Navigate } from 'react-router-dom';
import { t } from '@lingui/macro';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import {
  clampTimelineSidebarWidth,
  getTimelineSidebarWidthStorageKey,
  readTimelineSidebarWidth,
  writeTimelineSidebarWidth,
} from '@/features/planner/lib/timelineSidebarWidthStorage';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';

type AddTaskDefaults = {
  startDate: string;
  endDate: string;
  projectId?: string | null;
  assigneeIds?: string[];
};

const normalizeFilterIds = (value: unknown) => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
);

const normalizeFilters = (value: unknown): Filters => {
  const candidate = value && typeof value === 'object' ? (value as Partial<Filters>) : {};
  return {
    projectIds: normalizeFilterIds(candidate.projectIds),
    assigneeIds: normalizeFilterIds(candidate.assigneeIds),
    groupIds: normalizeFilterIds(candidate.groupIds),
    statusIds: normalizeFilterIds(candidate.statusIds),
    typeIds: normalizeFilterIds(candidate.typeIds),
    tagIds: normalizeFilterIds(candidate.tagIds),
    hideUnassigned: typeof candidate.hideUnassigned === 'boolean' ? candidate.hideUnassigned : false,
  };
};

interface PlannerTimelineAreaProps {
  viewMode: ViewMode;
  onCreateTaskRequest: (defaults: AddTaskDefaults) => void;
  timelineSidebarWidth: number | null;
  onTimelineSidebarWidthChange: (width: number) => void;
  onTimelineSidebarWidthReset: () => void;
  showLoadingOverlay: boolean;
  plannerLoading: boolean;
  plannerError: string | null;
}

const PlannerTimelineArea = React.memo(({
  viewMode,
  onCreateTaskRequest,
  timelineSidebarWidth,
  onTimelineSidebarWidthChange,
  onTimelineSidebarWidthReset,
  showLoadingOverlay,
  plannerLoading,
  plannerError,
}: PlannerTimelineAreaProps) => (
  <div className="flex-1 flex flex-col overflow-hidden min-h-0 timeline-surface">
    <TimelineControls />
    <div className="relative flex-1 overflow-hidden min-h-0">
      {viewMode === 'calendar'
        ? <CalendarTimeline />
        : (
          <TimelineGrid
            onCreateTask={onCreateTaskRequest}
            sidebarWidth={timelineSidebarWidth}
            onSidebarWidthChange={onTimelineSidebarWidthChange}
            onSidebarWidthReset={onTimelineSidebarWidthReset}
          />
        )
      }
      {showLoadingOverlay && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background/60">
          {t`Loading workspace...`}
        </div>
      )}
      {!plannerLoading && plannerError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive bg-background/70">
          {plannerError}
        </div>
      )}
    </div>
  </div>
));

PlannerTimelineArea.displayName = 'PlannerTimelineArea';

const PlannerPage = () => {
  usePageSeo({
    title: 'Motio — Timeline',
    description: 'Private timeline workspace in Motio.',
    canonicalPath: '/app',
    robots: 'noindex, nofollow',
  });

  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [filterWidth, setFilterWidth] = useState(320);
  const isMobile = useIsMobile();
  const [timelineSidebarWidth, setTimelineSidebarWidth] = useState<number | null | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDefaults, setAddTaskDefaults] = useState<AddTaskDefaults | null>(null);
  const loadWorkspaceData = usePlannerStore((state) => state.loadWorkspaceData);
  const refreshSampleDataFlag = usePlannerStore((state) => state.refreshSampleDataFlag);
  const plannerLoading = usePlannerStore((state) => state.loading);
  const plannerError = usePlannerStore((state) => state.error);
  const loadedRange = usePlannerStore((state) => state.loadedRange);
  const tasks = usePlannerStore((state) => state.tasks);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const statuses = usePlannerStore((state) => state.statuses);
  const taskTypes = usePlannerStore((state) => state.taskTypes);
  const tags = usePlannerStore((state) => state.tags);
  const milestones = usePlannerStore((state) => state.milestones);
  const filters = usePlannerStore((state) => state.filters);
  const setFilters = usePlannerStore((state) => state.setFilters);
  const clearFilterCriteria = usePlannerStore((state) => state.clearFilterCriteria);
  const clearFilters = usePlannerStore((state) => state.clearFilters);
  const viewMode = usePlannerStore((state) => state.viewMode);
  const setViewMode = usePlannerStore((state) => state.setViewMode);
  const groupMode = usePlannerStore((state) => state.groupMode);
  const currentDate = usePlannerStore((state) => state.currentDate);
  const setCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const requestScrollToDate = usePlannerStore((state) => state.requestScrollToDate);
  const scrollTargetDate = usePlannerStore((state) => state.scrollTargetDate);
  const highlightedTaskId = usePlannerStore((state) => state.highlightedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const workspacesLoaded = useAuthStore((state) => state.workspacesLoaded);
  const hasWorkspaces = useAuthStore((state) => state.workspaces.length > 0);
  const fetchMembers = useAuthStore((state) => state.fetchMembers);
  const membersLoading = useAuthStore((state) => state.membersLoading);
  const membersWorkspaceId = useAuthStore((state) => state.membersWorkspaceId);
  const profilePreferences = useAuthStore((state) => state.profilePreferences);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  // Marking your own days off is not task editing: viewers may do it too, so the
  // create button opens the dialog in time-off-only mode for them.
  const timeOffOn = isTimeOffEnabled();
  const canOpenCreateDialog = canEdit || timeOffOn;

  // The Week view is optional (per-user "week_view_enabled" preference). If a
  // user is on 'week' but the preference is off — e.g. they had it enabled and
  // turned it off, or carry a 'week' value persisted before the view became
  // optional — fall back to 'day'. Gated on profilePreferences !== null so it
  // only runs after the profile loads (avoids resetting an enabled user during
  // the initial async fetch).
  useEffect(() => {
    if (
      profilePreferences !== null
      && viewMode === 'week'
      && !isWeekViewEnabled(profilePreferences)
    ) {
      setViewMode('day');
    }
  }, [profilePreferences, viewMode, setViewMode]);

  useOnboardingTour({
    pageId: 'planner',
    canEdit,
  });
  const filtersHydratedRef = useRef(false);
  const timelineSidebarWidthHydratedRef = useRef(false);
  const centeredOnLoadRef = useRef(false);
  const filterResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const hasActiveFilters = filters.projectIds.length > 0
    || filters.assigneeIds.length > 0
    || filters.groupIds.length > 0
    || filters.statusIds.length > 0
    || filters.typeIds.length > 0
    || filters.tagIds.length > 0;
  const hasInitialData = tasks.length > 0
    || projects.length > 0
    || assignees.length > 0
    || statuses.length > 0
    || taskTypes.length > 0
    || tags.length > 0
    || milestones.length > 0;
  const showLoadingOverlay = plannerLoading && (!loadedRange || loadedRange.workspaceId !== currentWorkspaceId) && !hasInitialData;

  usePlannerLiveSync(currentWorkspaceId, loadedRange);
  useTaskUndoToasts();
  useRevealPendingTask();

  useEffect(() => {
    if (!currentWorkspaceId) return;
    void loadWorkspaceData(currentWorkspaceId);
  }, [currentWorkspaceId, currentDate, viewMode, loadWorkspaceData]);

  // Знаем ли мы, что в пространстве ещё лежат примеры: от этого зависит вопрос
  // после тура и пункт «Убрать примеры» в настройках.
  useEffect(() => {
    if (!currentWorkspaceId) return;
    void refreshSampleDataFlag(currentWorkspaceId);
  }, [currentWorkspaceId, refreshSampleDataFlag]);

  // Load workspace members (with avatarUrl) as soon as the workspace is known.
  // Without this, member avatars on the timeline are only visible after opening
  // a task (which mounts TaskCommentSection that triggers fetchMembers).
  useEffect(() => {
    if (!currentWorkspaceId || membersLoading) return;
    if (membersWorkspaceId === currentWorkspaceId) return;
    void fetchMembers(currentWorkspaceId);
  }, [currentWorkspaceId, fetchMembers, membersLoading, membersWorkspaceId]);

  useEffect(() => {
    if (centeredOnLoadRef.current) return;
    if (viewMode === 'calendar') return;
    const initialDate = scrollTargetDate ?? format(new Date(), 'yyyy-MM-dd');
    setCurrentDate(initialDate);
    requestScrollToDate(initialDate);
    centeredOnLoadRef.current = true;
  }, [requestScrollToDate, scrollTargetDate, setCurrentDate, viewMode]);

  useEffect(() => {
    if (!highlightedTaskId) return;
    const handlePointerDown = () => {
      setHighlightedTaskId(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [highlightedTaskId, setHighlightedTaskId]);

  useEffect(() => {
    filtersHydratedRef.current = false;
    if (!user?.id || typeof window === 'undefined') return;
    const storageKey = `planner-filters-${user.id}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      clearFilters();
      filtersHydratedRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const nextFilters = normalizeFilters(parsed);
      setFilters(nextFilters);
    } catch (_error) {
      clearFilters();
    } finally {
      filtersHydratedRef.current = true;
    }
  }, [clearFilters, setFilters, user?.id]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    if (!filtersHydratedRef.current) return;
    const storageKey = `planner-filters-${user.id}`;
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('planner-filter-width');
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setFilterWidth(Math.max(260, Math.min(520, parsed)));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('planner-filter-width', String(filterWidth));
  }, [filterWidth]);

  useEffect(() => {
    timelineSidebarWidthHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    if (!user?.id || !currentWorkspaceId) {
      setTimelineSidebarWidth(null);
      timelineSidebarWidthHydratedRef.current = true;
      return;
    }
    const storageKey = getTimelineSidebarWidthStorageKey(user.id, currentWorkspaceId);
    setTimelineSidebarWidth(readTimelineSidebarWidth(window.localStorage, storageKey));
    timelineSidebarWidthHydratedRef.current = true;
  }, [currentWorkspaceId, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id || !currentWorkspaceId) return;
    if (!timelineSidebarWidthHydratedRef.current) return;
    const storageKey = getTimelineSidebarWidthStorageKey(user.id, currentWorkspaceId);
    writeTimelineSidebarWidth(window.localStorage, storageKey, timelineSidebarWidth);
  }, [currentWorkspaceId, timelineSidebarWidth, user?.id]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = filterResizeRef.current;
      if (!resizeState || filterCollapsed) return;
      const deltaX = event.clientX - resizeState.startX;
      const nextWidth = Math.max(260, Math.min(520, resizeState.startWidth + deltaX));
      setFilterWidth(nextWidth);
    };

    const handleMouseUp = () => {
      filterResizeRef.current = null;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [filterCollapsed]);

  const handleCreateTaskRequest = useCallback((defaults: AddTaskDefaults) => {
    setAddTaskDefaults(defaults);
    setShowAddTask(true);
  }, []);

  const handleAddTaskOpenChange = useCallback((open: boolean) => {
    setShowAddTask(open);
    if (!open) {
      setAddTaskDefaults(null);
    }
  }, []);

  const handleFilterResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (filterCollapsed) return;
    filterResizeRef.current = { startX: event.clientX, startWidth: filterWidth };
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    event.preventDefault();
  }, [filterCollapsed, filterWidth]);

  const handleTimelineSidebarWidthChange = useCallback((width: number) => {
    setTimelineSidebarWidth(clampTimelineSidebarWidth(width));
  }, []);

  const handleTimelineSidebarWidthReset = useCallback(() => {
    setTimelineSidebarWidth(null);
  }, []);

  // On mobile in calendar mode, hide the FAB ("Add task") and the floating
  // filter trigger — the calendar view is read-only by design and these
  // controls would float over the month grid.
  const hideTimelineActions = isMobile && viewMode === 'calendar';

  useWorkspaceHeader(
    {
      primaryAction: hideTimelineActions ? undefined : (
        isMobile ? (
          // Mobile: a round, card-style icon FAB (the MobileFab wrapper adds the
          // floating position + shadow). Icon-only, so it needs an aria-label.
          <button
            type="button"
            data-tour="add-task-btn"
            aria-label={t`Add task`}
            onClick={() => {
              setAddTaskDefaults(null);
              setShowAddTask(true);
            }}
            disabled={!canOpenCreateDialog}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-primary hover:bg-accent disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SquarePen className="h-6 w-6" />
          </button>
        ) : (
          <Button
            data-tour="add-task-btn"
            onClick={() => {
              setAddTaskDefaults(null);
              setShowAddTask(true);
            }}
            size="sm"
            className="gap-2"
            disabled={!canOpenCreateDialog}
          >
            <Plus className="h-4 w-4" />
            {t`Add task`}
          </Button>
        )
      ),
      onOpenSettings: () => setShowSettings(true),
      onOpenAccountSettings: () => setShowAccountSettings(true),
      settingsDisabled: !canEdit,
    },
    [hideTimelineActions, canEdit, isMobile],
  );

  // Only the workspace-less service account lives in the admin console;
  // a working super admin (owner with the Keycloak role) stays in the app.
  if (isSuperAdmin && workspacesLoaded && !hasWorkspaces) {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <>
      <PushDeepLink />

      {hasActiveFilters && (
        <div className="flex items-center justify-between px-4 py-2 border-b-2 border-sky-500 bg-sky-50 text-sm text-sky-700">
          <span className="font-medium">{t`Filter applied`}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilterCriteria}
            className="h-7 px-2 text-sky-700 hover:text-sky-900"
          >
            {t`Reset`}
          </Button>
        </div>
      )}
      
      {/* Main content */}
      <div className="relative flex flex-1 overflow-hidden min-h-0">
        {/* Filter sidebar — in-flow on desktop, floating overlay on mobile */}
        {isMobile ? (
          <>
            {filterCollapsed && !hideTimelineActions && (
                <button
                  type="button"
                  aria-label={t`Expand filters`}
                  data-tour="filter-toggle"
                  onClick={() => setFilterCollapsed(false)}
                  style={{
                    left: `calc(${
                      groupMode === 'assignee'
                        ? 'clamp(48px, 14vw, 56px)'
                        : 'clamp(120px, 38vw, 152px)'
                    } + 24px)`,
                  }}
                  // Same 56px round button as the "add task" FAB, and lifted the
                  // same way: at 16px the button sat in the phone's rounded
                  // corner and under the home indicator, which clipped it.
                  className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)] z-30 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-accent"
                >
                  <Filter className="h-6 w-6 text-muted-foreground" />
                </button>
              )}

            {/* Mobile: a screen of its own, the same shell every other phone
                list uses. A centred card capped at 80dvh had two nested
                scrollers, no anchor to the visual viewport (so the keyboard
                covered the search fields it opened) and no way out but a 28px
                chevron.
                Mounted always and driven by `open`, not swapped in and out of
                the tree: unmounting skips the slide-out, and this would be the
                only phone screen that vanishes in a single frame.
                `px-0` and not `p-0`: tailwind-merge lets `p-*` supersede the
                shell's bottom safe-area padding, which is what keeps the last
                row clear of the screen's rounded corner. */}
            <MobileScreenShell
              open={!filterCollapsed}
              onOpenChange={(open) => { if (!open) setFilterCollapsed(true); }}
              title={t`Filters`}
              contentClassName="px-0 pt-0"
            >
              <FilterPanel
                collapsed={false}
                onToggle={() => setFilterCollapsed(true)}
                touch
              />
            </MobileScreenShell>
          </>
        ) : (
          <div
            className="relative flex-shrink-0 h-full"
            style={filterCollapsed ? undefined : { width: filterWidth }}
          >
            <FilterPanel
              collapsed={filterCollapsed}
              onToggle={() => setFilterCollapsed(!filterCollapsed)}
            />
            {!filterCollapsed && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t`Resize filters`}
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border/70"
                onMouseDown={handleFilterResizeStart}
              />
            )}
          </div>
        )}

        {/* Timeline area */}
        <PlannerTimelineArea
          viewMode={viewMode}
          onCreateTaskRequest={handleCreateTaskRequest}
          timelineSidebarWidth={timelineSidebarWidth ?? null}
          onTimelineSidebarWidthChange={handleTimelineSidebarWidthChange}
          onTimelineSidebarWidthReset={handleTimelineSidebarWidthReset}
          showLoadingOverlay={showLoadingOverlay}
          plannerLoading={plannerLoading}
          plannerError={plannerError}
        />
      </div>
      
      {/* Panels */}
      <TaskDetailPanel />
      <WorkspaceCommonDialogs
        showSettings={showSettings}
        onShowSettingsChange={setShowSettings}
        showAccountSettings={showAccountSettings}
        onShowAccountSettingsChange={setShowAccountSettings}
      />
      <AddTaskDialog
        open={showAddTask}
        onOpenChange={handleAddTaskOpenChange}
        initialStartDate={addTaskDefaults?.startDate}
        initialEndDate={addTaskDefaults?.endDate}
        initialProjectId={addTaskDefaults?.projectId}
        initialAssigneeIds={addTaskDefaults?.assigneeIds}
        timeOffEnabled={timeOffOn}
        timeOffOnly={timeOffOn && !canEdit}
      />
    </>
  );
};

export default PlannerPage;
