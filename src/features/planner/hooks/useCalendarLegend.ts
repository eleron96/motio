import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { endOfMonth, format } from 'date-fns';
import { togglePersonSelection, type CalendarOverlayCategory } from '@/features/planner/lib/calendarDayMarkers';
import {
  DEFAULT_CALENDAR_LEGEND_STATE,
  getCalendarLegendStorageKey,
  readCalendarLegend,
  writeCalendarLegend,
  type CalendarLegendState,
} from '@/features/planner/lib/calendarLegendStorage';
import type { Assignee, TimeOff } from '@/features/planner/types/planner';

interface UseCalendarLegendOptions {
  userId: string | undefined;
  workspaceId: string | null;
  /** The months the calendar renders; the people list follows this window. */
  months: Date[];
  timeOff: TimeOff[];
  assignees: Assignee[];
  myAssigneeId: string | null;
}

/**
 * The calendar's legend: which overlays show (holidays, milestones, time off)
 * and whose days off are marked. Kept per user and per workspace.
 */
export const useCalendarLegend = ({
  userId,
  workspaceId,
  months,
  timeOff,
  assignees,
  myAssigneeId,
}: UseCalendarLegendOptions) => {
  // `legendHydrated` stops the defaults from overwriting what was stored
  // before the read effect runs (the same guard the sidebar width needs in
  // PlannerPage).
  const [legendState, setLegendState] = useState<CalendarLegendState>(DEFAULT_CALENDAR_LEGEND_STATE);
  const legendHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userId || !workspaceId) return;
    legendHydratedRef.current = false;
    const stored = readCalendarLegend(
      window.localStorage,
      getCalendarLegendStorageKey(userId, workspaceId),
    );
    setLegendState(stored ?? DEFAULT_CALENDAR_LEGEND_STATE);
    legendHydratedRef.current = true;
  }, [workspaceId, userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!legendHydratedRef.current) return;
    if (!userId || !workspaceId) return;
    writeCalendarLegend(
      window.localStorage,
      getCalendarLegendStorageKey(userId, workspaceId),
      legendState,
    );
  }, [workspaceId, legendState, userId]);

  // People shown on the calendar. A LOCAL selection, deliberately separate from
  // the global people filter: that one narrows tasks and milestones everywhere,
  // while this one only decides whose days off are marked here.
  // Only people who actually have time off inside the rendered window. A tick
  // box for somebody who never leaves toggles nothing — it just costs a row, and
  // a thirty-person team turns the panel into a wall of checkboxes. The list
  // shrinks and grows with the window as the user scrolls through years.
  const peopleIdsWithTimeOff = useMemo(() => {
    if (months.length === 0) return new Set<string>();
    const windowStart = format(months[0], 'yyyy-MM-dd');
    const windowEnd = format(endOfMonth(months[months.length - 1]), 'yyyy-MM-dd');
    const ids = new Set<string>();
    timeOff.forEach((record) => {
      if (record.endDate < windowStart || record.startDate > windowEnd) return;
      ids.add(record.assigneeId);
    });
    return ids;
  }, [months, timeOff]);

  const activePeople = useMemo(
    () => assignees.filter((assignee) => assignee.isActive),
    [assignees],
  );

  const calendarPeople = useMemo(
    () => activePeople
      .filter((assignee) => peopleIdsWithTimeOff.has(assignee.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [activePeople, peopleIdsWithTimeOff],
  );

  /** Teammates with nothing to show in this window — counted, not listed. */
  const peopleWithoutTimeOff = activePeople.length - calendarPeople.length;

  // People with time off who are not in the assignee list — that list is pruned
  // to those with an account or a task in the loaded window, while time off
  // arrives on its own window. They share ONE row instead of a column of
  // identical "unknown user" lines, but they still have to be switchable:
  // otherwise their circles sit on the calendar with no way to hide them.
  const unknownPeopleIds = useMemo(() => {
    const knownIds = new Set(calendarPeople.map((person) => person.id));
    return Array.from(peopleIdsWithTimeOff).filter((id) => !knownIds.has(id));
  }, [calendarPeople, peopleIdsWithTimeOff]);

  const handleTogglePerson = useCallback((assigneeId: string) => {
    setLegendState((current) => ({
      ...current,
      people: togglePersonSelection(
        current.people,
        assigneeId,
        [...calendarPeople.map((person) => person.id), ...unknownPeopleIds],
      ),
    }));
  }, [calendarPeople, unknownPeopleIds]);

  const handleToggleUnknownPeople = useCallback(() => {
    setLegendState((current) => {
      const allIds = [...calendarPeople.map((person) => person.id), ...unknownPeopleIds];
      const shown = current.people === null || unknownPeopleIds.every((id) => current.people?.includes(id));
      const base = current.people ?? allIds;
      const next = shown
        ? base.filter((id) => !unknownPeopleIds.includes(id))
        : [...base, ...unknownPeopleIds.filter((id) => !base.includes(id))];
      return {
        ...current,
        people: allIds.every((id) => next.includes(id)) ? null : next,
      };
    });
  }, [calendarPeople, unknownPeopleIds]);

  const handleShowOnlyPerson = useCallback((assigneeId: string) => {
    setLegendState((current) => ({ ...current, people: [assigneeId] }));
  }, []);

  const handleShowAllPeople = useCallback(() => {
    setLegendState((current) => ({ ...current, people: null }));
  }, []);

  const handleShowOnlyMe = useCallback(() => {
    setLegendState((current) => ({ ...current, people: myAssigneeId ? [myAssigneeId] : current.people }));
  }, [myAssigneeId]);

  const handleLegendToggle = useCallback((category: CalendarOverlayCategory) => {
    setLegendState((current) => ({
      ...current,
      visibility: { ...current.visibility, [category]: !current.visibility[category] },
    }));
  }, []);

  return {
    legendState,
    legend: legendState.visibility,
    calendarPeople,
    peopleWithoutTimeOff,
    unknownPeopleIds,
    handleTogglePerson,
    handleToggleUnknownPeople,
    handleShowOnlyPerson,
    handleShowAllPeople,
    handleShowOnlyMe,
    handleLegendToggle,
  };
};
