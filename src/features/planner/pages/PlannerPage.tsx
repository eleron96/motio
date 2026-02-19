import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TimelineGrid } from '@/features/planner/components/timeline/TimelineGrid';
import { CalendarTimeline } from '@/features/planner/components/timeline/CalendarTimeline';
import { TimelineControls } from '@/features/planner/components/timeline/TimelineControls';
import { FilterPanel } from '@/features/planner/components/FilterPanel';
import { TaskDetailPanel } from '@/features/planner/components/TaskDetailPanel';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { AddTaskDialog } from '@/features/planner/components/AddTaskDialog';
import { Button } from '@/shared/ui/button';
import { Plus, Settings, User } from 'lucide-react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { Filters, ViewMode } from '@/features/planner/types/planner';
import { format } from 'date-fns';
import { Navigate } from 'react-router-dom';
import { t } from '@lingui/macro';

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

const TIMELINE_SIDEBAR_MIN_WIDTH = 200;
const TIMELINE_SIDEBAR_MAX_WIDTH = 520;

const clampTimelineSidebarWidth = (value: number) => (
  Math.max(TIMELINE_SIDEBAR_MIN_WIDTH, Math.min(TIMELINE_SIDEBAR_MAX_WIDTH, value))
);

const getTimelineSidebarWidthStorageKey = (userId: string, workspaceId: string) => (
  `planner-timeline-sidebar-width-${userId}-${workspaceId}`
);

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
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [filterWidth, setFilterWidth] = useState(320);
  const [timelineSidebarWidth, setTimelineSidebarWidth] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDefaults, setAddTaskDefaults] = useState<AddTaskDefaults | null>(null);
  const loadWorkspaceData = usePlannerStore((state) => state.loadWorkspaceData);
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
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
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

  useEffect(() => {
    if (!currentWorkspaceId) return;
    void loadWorkspaceData(currentWorkspaceId);
  }, [currentWorkspaceId, currentDate, viewMode, loadWorkspaceData]);

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
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setTimelineSidebarWidth(null);
      timelineSidebarWidthHydratedRef.current = true;
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setTimelineSidebarWidth(null);
      timelineSidebarWidthHydratedRef.current = true;
      return;
    }
    setTimelineSidebarWidth(clampTimelineSidebarWidth(parsed));
    timelineSidebarWidthHydratedRef.current = true;
  }, [currentWorkspaceId, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id || !currentWorkspaceId) return;
    if (!timelineSidebarWidthHydratedRef.current) return;
    const storageKey = getTimelineSidebarWidthStorageKey(user.id, currentWorkspaceId);
    if (timelineSidebarWidth === null) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, String(clampTimelineSidebarWidth(timelineSidebarWidth)));
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

  if (isSuperAdmin) {
    return <Navigate to="/admin/users" replace />;
  }
  
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
          <WorkspaceNav />
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setAddTaskDefaults(null);
              setShowAddTask(true);
            }}
            size="sm"
            className="gap-2"
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" />
            {t`Add task`}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="h-9 w-9"
            disabled={!canEdit}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <InviteNotifications />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAccountSettings(true)}
            className="h-9 w-9"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </header>

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
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Filter sidebar */}
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
        
        {/* Timeline area */}
        <PlannerTimelineArea
          viewMode={viewMode}
          onCreateTaskRequest={handleCreateTaskRequest}
          timelineSidebarWidth={timelineSidebarWidth}
          onTimelineSidebarWidthChange={handleTimelineSidebarWidthChange}
          onTimelineSidebarWidthReset={handleTimelineSidebarWidthReset}
          showLoadingOverlay={showLoadingOverlay}
          plannerLoading={plannerLoading}
          plannerError={plannerError}
        />
      </div>
      
      {/* Panels */}
      <TaskDetailPanel />
      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
      <AccountSettingsDialog open={showAccountSettings} onOpenChange={setShowAccountSettings} />
      <AddTaskDialog
        open={showAddTask}
        onOpenChange={handleAddTaskOpenChange}
        initialStartDate={addTaskDefaults?.startDate}
        initialEndDate={addTaskDefaults?.endDate}
        initialProjectId={addTaskDefaults?.projectId}
        initialAssigneeIds={addTaskDefaults?.assigneeIds}
      />
    </div>
  );
};

export default PlannerPage;
