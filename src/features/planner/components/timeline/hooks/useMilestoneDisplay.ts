import { useState, useCallback, useMemo } from 'react';
import { Milestone, Project } from '@/features/planner/types/planner';
import {
  buildMilestoneTooltipCells,
  buildVisibleDayIndexMap,
  buildVisibleMilestoneLines,
  calculateMilestoneOffsets,
  filterMilestonesByProjects,
  groupMilestonesByDate,
  sortMilestonesByDateAndTitle,
} from '@/features/planner/lib/timelineMilestoneSelectors';
import { HEADER_HEIGHT } from '@/features/planner/lib/dateUtils';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';

interface UseMilestoneDisplayParams {
  milestones: Milestone[];
  filterProjectIds: string[];
  visibleDays: Date[];
  projects: Project[];
  isMobile?: boolean;
  /** Milestones of these projects are hidden along with their rows and tasks. */
  hiddenProjectIds?: ReadonlySet<string>;
}

export const useMilestoneDisplay = ({
  milestones,
  filterProjectIds,
  visibleDays,
  projects,
  isMobile = false,
  hiddenProjectIds,
}: UseMilestoneDisplayParams) => {
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneLine, setMilestoneLine] = useState<{
    date: string;
    color: string;
    visible: boolean;
  } | null>(null);

  // ─── Selectors ──────────────────────────────────────────────────────────────

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const filteredMilestones = useMemo(
    () => filterMilestonesByProjects(milestones, filterProjectIds, hiddenProjectIds),
    [milestones, filterProjectIds, hiddenProjectIds],
  );

  const sortedMilestones = useMemo(
    () => sortMilestonesByDateAndTitle(filteredMilestones),
    [filteredMilestones],
  );

  const visibleDayIndex = useMemo(
    () => buildVisibleDayIndexMap(visibleDays),
    [visibleDays],
  );

  const milestonesByDate = useMemo(
    () => groupMilestonesByDate(sortedMilestones),
    [sortedMilestones],
  );

  const milestoneOffsets = useMemo(
    () => calculateMilestoneOffsets(milestonesByDate),
    [milestonesByDate],
  );

  const visibleMilestoneLines = useMemo(
    () => buildVisibleMilestoneLines({
      milestones: sortedMilestones,
      visibleDayIndex,
      projectById,
      defaultColor: DEFAULT_NEUTRAL_COLOR,
    }),
    [projectById, sortedMilestones, visibleDayIndex],
  );

  const milestoneTooltipCells = useMemo(
    () => buildMilestoneTooltipCells({
      milestonesByDate,
      visibleDayIndex,
      projectById,
      defaultColor: DEFAULT_NEUTRAL_COLOR,
    }),
    [milestonesByDate, projectById, visibleDayIndex],
  );

  // ─── Dimensions ─────────────────────────────────────────────────────────────

  const effectiveHeaderHeight = isMobile ? 56 : HEADER_HEIGHT;
  const milestoneRowHeight = isMobile ? 16 : 56;
  const milestoneDotRadius = 5;
  const milestoneLineTop = effectiveHeaderHeight + milestoneRowHeight / 2 + milestoneDotRadius;
  const milestoneLineHeight = `calc(100% - ${milestoneLineTop}px)`;
  const milestoneLineWidth = 3;
  const milestoneLineHoverWidth = 4;
  const milestoneHeaderRowTop = isMobile ? 0 : 40;
  const milestoneHeaderRowHeight = effectiveHeaderHeight - milestoneHeaderRowTop;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleMilestoneDialogChange = useCallback((open: boolean) => {
    setMilestoneDialogOpen(open);
    if (!open) {
      setMilestoneDialogDate(null);
      setEditingMilestone(null);
    }
  }, []);

  const handleCreateMilestone = useCallback((date: string) => {
    setEditingMilestone(null);
    setMilestoneDialogDate(date);
    setMilestoneDialogOpen(true);
  }, []);

  const handleEditMilestone = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleMilestoneHover = useCallback((date: string, color: string) => {
    setMilestoneLine({ date, color, visible: true });
  }, []);

  const handleMilestoneHoverEnd = useCallback(() => {
    setMilestoneLine(null);
  }, []);

  return {
    // state
    milestoneDialogOpen,
    milestoneDialogDate,
    editingMilestone,
    milestoneLine,
    // derived
    projectById,
    sortedMilestones,
    visibleDayIndex,
    milestonesByDate,
    milestoneOffsets,
    visibleMilestoneLines,
    milestoneTooltipCells,
    // dimensions
    effectiveHeaderHeight,
    milestoneRowHeight,
    milestoneDotRadius,
    milestoneLineTop,
    milestoneLineHeight,
    milestoneLineWidth,
    milestoneLineHoverWidth,
    milestoneHeaderRowTop,
    milestoneHeaderRowHeight,
    // handlers
    handleMilestoneDialogChange,
    handleCreateMilestone,
    handleEditMilestone,
    handleMilestoneHover,
    handleMilestoneHoverEnd,
  };
};
