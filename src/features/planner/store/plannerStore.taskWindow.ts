import { fetchTaskCommentCountsInWindow } from '@/infrastructure/tasks/taskCommentsRepository';
import type {
  PlannerGetState,
  PlannerSetState,
} from '@/features/planner/store/plannerStore.contract';
import {
  buildTaskRange,
  mapTimeOffRow,
  planTaskWindowLoad,
  type LoadedTaskWindow,
  TaskRow,
  TimeOffRow,
} from '@/features/planner/store/plannerStore.helpers';
import type { Task } from '@/features/planner/types/planner';
import { keepTimeOffIfSame } from '@/features/planner/lib/timeOff';
import {
  mergeWindowCommentCounts,
  mergeWindowRows,
  selectWindowTasks,
  selectWindowTimeOff,
} from '@/features/planner/store/plannerStore.windowRows';
import { loadFullWorkspaceData } from '@/features/planner/store/plannerStore.workspaceLoad';

// The task-window load in flight (full or shift). Every window load bumps
// windowLoadSeq; a shift whose number is no longer current drops its answer.
// Full loads are guarded by dataRequestId, like everything they start.
let windowLoadSeq = 0;
let activeWindowLoad: {
  seq: number;
  kind: 'full' | 'shift';
  window: LoadedTaskWindow;
  promise: Promise<void>;
} | null = null;

/**
 * The timeline has moved past the loaded window (scrolled toward its edge, or
 * a jump inside the same workspace): reload only the windowed data — tasks,
 * time off, comment counts — around the new date. Workspace catalogues stay,
 * nothing shows a loading state, and the open or peeked task stays open even
 * if it falls outside the new window.
 */
const shiftTaskWindow = async (
  set: PlannerSetState,
  get: PlannerGetState,
  window: LoadedTaskWindow,
  seq: number,
) => {
  const requestId = get().dataRequestId;
  const [tasksRes, timeOffRes, commentCountsRes] = await Promise.all([
    selectWindowTasks(window),
    selectWindowTimeOff(window),
    fetchTaskCommentCountsInWindow(window.workspaceId, window.start, window.end),
  ]);
  if (seq !== windowLoadSeq || get().dataRequestId !== requestId || get().workspaceId !== window.workspaceId) {
    return;
  }
  if (tasksRes.error) {
    // The old window stays; the next move of the timeline asks again.
    console.error(tasksRes.error);
    return;
  }
  if (timeOffRes.error) console.error(timeOffRes.error);
  if ('error' in commentCountsRes) console.error(commentCountsRes.error);

  const taskRows = (tasksRes.data ?? []) as unknown as TaskRow[];
  const windowCounts = 'error' in commentCountsRes ? null : commentCountsRes.data;
  set((state) => {
    const board = state.boardScope?.workspaceId === window.workspaceId ? state.boardScope : null;
    const merged = mergeWindowRows(state, taskRows, board);
    const mergedIds = new Set(merged.map((task) => task.id));
    const heldTasks = [state.selectedTaskId, state.peekedTaskId]
      .filter((taskId): taskId is string => Boolean(taskId) && !mergedIds.has(taskId as string))
      .map((taskId) => state.tasks.find((task) => task.id === taskId))
      .filter((task): task is Task => Boolean(task));
    const tasks = heldTasks.length > 0 ? [...merged, ...heldTasks] : merged;
    const keptIds = heldTasks.length > 0 ? new Set(tasks.map((task) => task.id)) : mergedIds;
    return {
      tasks,
      taskCommentCounts: mergeWindowCommentCounts(
        state.taskCommentCounts,
        keptIds,
        taskRows.map((row) => row.id),
        windowCounts,
      ),
      timeOff: timeOffRes.error
        ? state.timeOff
        : keepTimeOffIfSame(state.timeOff, ((timeOffRes.data ?? []) as unknown as TimeOffRow[]).map(mapTimeOffRow)),
      loadedRange: window,
      ...(state.highlightedTaskId && !keptIds.has(state.highlightedTaskId)
        ? { highlightedTaskId: null, highlightedTaskRowAssigneeId: null }
        : {}),
    };
  });
  if (!windowCounts) {
    void get().refreshTaskCommentCounts(window.workspaceId, taskRows.map((row) => row.id));
  }
};

/**
 * Loads the task window the current view needs: reuses a window already loaded
 * or on its way, shifts it when the view moved a little, or loads the whole
 * workspace.
 */
export const loadTaskWindow = (
  set: PlannerSetState,
  get: PlannerGetState,
  workspaceId: string,
): Promise<void> => {
  const { currentDate, viewMode, loadedRange } = get();
  const request = { workspaceId, currentDate, viewMode };
  const inFlight = activeWindowLoad && activeWindowLoad.seq === windowLoadSeq ? activeWindowLoad : null;
  // A load already on its way with a window that serves this view: wait for it.
  if (inFlight && planTaskWindowLoad(inFlight.window, request) === 'reuse') {
    return inFlight.promise;
  }

  let plan = planTaskWindowLoad(loadedRange, request);
  // A full load in flight may be for another workspace and owns `loading`:
  // only another full load replaces it.
  if (inFlight?.kind === 'full') plan = 'full';
  if (plan === 'reuse') {
    // A shift in flight would swap in a window this view does not need.
    if (inFlight) windowLoadSeq += 1;
    return Promise.resolve();
  }

  const seq = ++windowLoadSeq;
  const window: LoadedTaskWindow = { ...buildTaskRange(currentDate, viewMode), viewMode, workspaceId };
  const promise = (plan === 'shift'
    ? shiftTaskWindow(set, get, window, seq)
    : loadFullWorkspaceData(set, get, window)
  ).finally(() => {
    if (activeWindowLoad?.seq === seq) activeWindowLoad = null;
  });
  activeWindowLoad = { seq, kind: plan, window, promise };
  return promise;
};
