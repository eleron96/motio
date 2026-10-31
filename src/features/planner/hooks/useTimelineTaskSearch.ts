import { useCallback, useEffect, useMemo, useRef } from 'react';
import { format } from '@/features/planner/lib/dateUtils';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import type { Assignee, MemberGroupAssignment, Task } from '@/features/planner/types/planner';
import {
  collectTaskSearchHits,
  isSearchableQuery,
  splitHitsByRange,
} from '@/shared/domain/taskSearch';
import { needsAssigneeGroupingToRevealTask } from '@/shared/domain/timelineTaskReveal';
import { buildAssigneeGroupMap, selectFilteredTasks } from '@/features/planner/lib/timelineSelectors';

/** Typing pause before asking the server: a word, not every letter. */
const SERVER_SEARCH_DELAY_MS = 200;

const todayKey = () => format(new Date(), 'yyyy-MM-dd');

// Frozen fallbacks: partial store mocks in tests don't carry every field, and a
// fresh `?? []` each render would re-run the search effects.
const NO_TASKS: Task[] = [];
const NO_ASSIGNEES: Assignee[] = [];
const NO_GROUP_ASSIGNMENTS: MemberGroupAssignment[] = [];

/**
 * Runs the search while the field is open: matches among the loaded tasks at
 * once, then the server's (all dates) merged in. Mount once, with the field.
 */
export const useTimelineTaskSearchRunner = () => {
  const open = useTaskSearchStore((state) => state.open);
  const query = useTaskSearchStore((state) => state.query);
  const setResults = useTaskSearchStore((state) => state.setResults);
  const setSearching = useTaskSearchStore((state) => state.setSearching);
  const tasks = usePlannerStore((state) => state.tasks ?? NO_TASKS);
  const filters = usePlannerStore((state) => state.filters);
  const assignees = usePlannerStore((state) => state.assignees ?? NO_ASSIGNEES);
  const memberGroupAssignments = usePlannerStore((state) => state.memberGroupAssignments ?? NO_GROUP_ASSIGNMENTS);
  const searchTasks = usePlannerStore((state) => state.searchTasks);
  const workspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const serverHitsRef = useRef<{ query: string; tasks: Task[] }>({ query: '', tasks: [] });

  const assigneeGroupMap = useMemo(
    () => buildAssigneeGroupMap(assignees, memberGroupAssignments),
    [assignees, memberGroupAssignments],
  );

  const publish = useCallback((currentQuery: string) => {
    const server = serverHitsRef.current.query === currentQuery ? serverHitsRef.current.tasks : [];
    // Loaded tasks first: they carry the latest local edits.
    const hits = collectTaskSearchHits([tasks, server], currentQuery, todayKey());
    const visible = new Set(filters
      ? selectFilteredTasks(hits, filters, assigneeGroupMap, assignees).map((task) => task.id)
      : hits.map((task) => task.id));
    setResults(hits, new Set(hits.filter((hit) => !visible.has(hit.id)).map((hit) => hit.id)));
  }, [assigneeGroupMap, assignees, filters, setResults, tasks]);

  // Local matches: instant, and again whenever the loaded tasks change.
  useEffect(() => {
    if (!open || !isSearchableQuery(query)) {
      setResults([], new Set());
      return;
    }
    publish(query);
  }, [open, publish, query, setResults]);

  // Server matches: after a pause; a stale answer is dropped.
  useEffect(() => {
    if (!open || !workspaceId || !isSearchableQuery(query)) {
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const result = await searchTasks(workspaceId, query);
      if (!active) return;
      setSearching(false);
      if (result.error) return;
      serverHitsRef.current = { query, tasks: result.tasks };
      publish(query);
    }, SERVER_SEARCH_DELAY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // `publish` changes with every loaded-tasks update; that must not re-ask the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, searchTasks, workspaceId]);
};

/** Moving between matches and opening them; usable from any search piece. */
export const useTimelineTaskSearchNavigation = () => {
  const hits = useTaskSearchStore((state) => state.hits);
  const focusedId = useTaskSearchStore((state) => state.focusedId);
  const visibleRange = useTaskSearchStore((state) => state.visibleRange);
  const renderedRange = useTaskSearchStore((state) => state.renderedRange);
  const setFocusedId = useTaskSearchStore((state) => state.setFocusedId);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const groupMode = usePlannerStore((state) => state.groupMode);
  const setGroupMode = usePlannerStore((state) => state.setGroupMode);
  const setCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);

  const focusHit = useCallback((hit: Task) => {
    setFocusedId(hit.id);
    if (needsAssigneeGroupingToRevealTask({ task: hit, projects, assignees, groupMode })) {
      setGroupMode('assignee');
    }
    // Already rendered: the grid just scrolls to the focused bar. Moving the
    // date as well would re-centre the grid mid-scroll and the smooth scroll
    // would land on the old spot, off the bar. Only a match outside the
    // rendered days moves the date; the grid finds the bar once it loads.
    const rendered = renderedRange
      && hit.startDate >= renderedRange.start
      && hit.startDate <= renderedRange.end;
    if (!rendered) setCurrentDate(hit.startDate);
  }, [assignees, groupMode, projects, renderedRange, setCurrentDate, setFocusedId, setGroupMode]);

  const step = useCallback((direction: 1 | -1) => {
    if (hits.length === 0) return;
    const index = hits.findIndex((hit) => hit.id === focusedId);
    let next: Task | undefined;
    if (index >= 0) {
      next = hits[(index + direction + hits.length) % hits.length];
    } else {
      const { before, inside, after } = splitHitsByRange(hits, visibleRange);
      next = direction === 1
        ? inside[0] ?? after[0] ?? hits[0]
        : inside[inside.length - 1] ?? before[before.length - 1] ?? hits[hits.length - 1];
    }
    if (next) focusHit(next);
  }, [focusHit, focusedId, hits, visibleRange]);

  const openFocused = useCallback(() => {
    if (focusedId) setSelectedTaskId(focusedId);
  }, [focusedId, setSelectedTaskId]);

  return {
    focusHit,
    focusNext: () => step(1),
    focusPrevious: () => step(-1),
    openFocused,
  };
};
