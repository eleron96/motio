import React, { Suspense } from 'react';
import { t } from '@lingui/macro';
import { TimelineGrid } from '@/features/planner/components/timeline/TimelineGrid';
import { CalendarTimeline } from '@/features/planner/components/timeline/CalendarTimeline';
import { TimelineControls } from '@/features/planner/components/timeline/TimelineControls';
import { TimelineSearchStrip } from '@/features/planner/components/timeline/TimelineSearchStrip';
import { TimelineSearchOverlay } from '@/features/planner/components/timeline/TimelineSearchOverlay';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import { importPlannerBoard } from '@/features/planner/lib/plannerBoardChunk';
import type { PlannerSurface, ViewMode } from '@/features/planner/types/planner';

const PlannerBoard = lazyNamed(importPlannerBoard, 'PlannerBoard');

export type AddTaskDefaults = {
  startDate: string;
  endDate: string;
  projectId?: string | null;
  assigneeIds?: string[];
  statusId?: string;
};

interface PlannerTimelineAreaProps {
  viewMode: ViewMode;
  surface: PlannerSurface;
  onCreateTaskRequest: (defaults: AddTaskDefaults) => void;
  timelineSidebarWidth: number | null;
  onTimelineSidebarWidthChange: (width: number) => void;
  onTimelineSidebarWidthReset: () => void;
  showLoadingOverlay: boolean;
  plannerLoading: boolean;
  plannerError: string | null;
}

export const PlannerTimelineArea = React.memo(({
  viewMode,
  surface,
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
    {surface === 'timeline' && viewMode !== 'calendar' && <TimelineSearchStrip />}
    <div className="relative flex-1 overflow-hidden min-h-0">
      {surface === 'board' && (
        <Suspense
          fallback={(
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t`Loading board...`}
            </div>
          )}
        >
          <PlannerBoard onCreateTask={onCreateTaskRequest} />
        </Suspense>
      )}
      {surface === 'timeline' && (viewMode === 'calendar'
        ? <CalendarTimeline />
        : (
          <TimelineGrid
            onCreateTask={onCreateTaskRequest}
            sidebarWidth={timelineSidebarWidth}
            onSidebarWidthChange={onTimelineSidebarWidthChange}
            onSidebarWidthReset={onTimelineSidebarWidthReset}
          />
        )
      )}
      {surface === 'timeline' && viewMode !== 'calendar' && (
        <TimelineSearchOverlay />
      )}
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
