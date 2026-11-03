import { useMemo } from 'react';
import { buildTimeOffIndex, EMPTY_TIME_OFF_INDEX } from '@/features/planner/lib/timeOff';
import { resolveRowMotif, type TimeOffMotifId } from '@/features/planner/lib/timeOffMotifs';
import type { Assignee, GroupMode, TimeOff, TimeOffDragPreview } from '@/features/planner/types/planner';

interface UseTimelineTimeOffOptions {
  groupMode: GroupMode;
  timeOff: TimeOff[];
  timeOffDragPreview: TimeOffDragPreview;
  visibleDays: Date[];
  assignees: Assignee[];
  myAssigneeId: string | null;
  myProfilePreferences: Record<string, unknown> | null;
}

/** Who is away on the visible days, by row, and the pattern each such row is shaded with. */
export const useTimelineTimeOff = ({
  groupMode,
  timeOff,
  timeOffDragPreview,
  visibleDays,
  assignees,
  myAssigneeId,
  myProfilePreferences,
}: UseTimelineTimeOffOptions) => {
  // Time-off records of the visible window, grouped by row. Assignee grouping
  // only: project rows have no person, so there is nothing to shade there.
  const timeOffIndex = useMemo(
    () => (groupMode === 'assignee'
      ? buildTimeOffIndex(timeOff, visibleDays, timeOffDragPreview)
      : EMPTY_TIME_OFF_INDEX),
    [groupMode, timeOff, timeOffDragPreview, visibleDays],
  );

  // Decorative motif per row. Mine comes from the live preference so the settings
  // picker repaints my row at once; a teammate's rides along on their assignee
  // record. Only rows that actually carry time off get an entry — every other row
  // stays attribute-less and unchanged.
  const motifByRowId = useMemo(() => {
    const motifs = new Map<string, TimeOffMotifId>();
    if (timeOffIndex.byRowId.size === 0) return motifs;
    const motifByAssigneeId = new Map(
      assignees.map((assignee) => [assignee.id, assignee.timeOffMotif]),
    );
    timeOffIndex.byRowId.forEach((_records, rowId) => {
      motifs.set(rowId, resolveRowMotif({
        isMe: rowId === myAssigneeId,
        myPreferences: myProfilePreferences,
        assigneeMotif: motifByAssigneeId.get(rowId),
      }));
    });
    return motifs;
  }, [assignees, myAssigneeId, myProfilePreferences, timeOffIndex]);

  return { timeOffIndex, motifByRowId };
};
