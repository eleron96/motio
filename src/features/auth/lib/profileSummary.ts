import { addDays, differenceInCalendarDays, differenceInCalendarMonths, format, parseISO } from 'date-fns';
import type { Assignee, Project, Status, Task } from '@/features/planner/types/planner';
import { resolveCurrentUserAssigneeId } from '@/features/planner/lib/timelineSelectors';
import { isTaskStartedBy, toCompletionPercent } from '@/shared/domain/taskCompletionRate';

/**
 * Personal at-a-glance numbers shown on the Account → Profile tab. Everything
 * here is derived client-side from the planner store the workspace already
 * loaded, so the summary costs no extra round-trips.
 */
export interface ProfileSummaryData {
  /** True once the current user maps to an assignee that actually has tasks. */
  hasData: boolean;
  /** Tasks in a final status. */
  completed: number;
  /**
   * Final / all among tasks that have already started (start date today or
   * earlier), rounded to a whole percent. Future tasks don't lower it.
   */
  completionRate: number;
  /** Open tasks — neither final nor cancelled. */
  active: number;
  /** Open tasks whose end date is already in the past. */
  overdue: number;
  /** Tasks finalised within the trailing 7 days. */
  completedThisWeek: number;
  /** Consecutive days up to today with at least one finalised task. */
  streakDays: number;
  /** Distinct projects the user has any task in. */
  projectCount: number;
  /**
   * Finalisations per trailing 7-day window, oldest first; the last entry is
   * the current window (equals `completedThisWeek`). Always PROFILE_WEEKS long.
   */
  weeklyCompleted: number[];
  /** Current window minus the one before it. */
  weekDelta: number;
  /** Largest entry of `weeklyCompleted`. */
  bestWeek: number;
  /**
   * Up to PROFILE_TOP_PROJECTS projects by task count, with their share of the
   * user's tasks that belong to a project (whole percent).
   */
  topProjects: ProfileTopProject[];
  /** Whole months since the account was created. */
  monthsInMotio: number | null;
}

export interface ProfileTopProject {
  id: string;
  name: string;
  share: number;
}

/** How many weekly bars the Profile tab shows. */
export const PROFILE_WEEKS = 8;
/** How many projects the "where your tasks are" list shows. */
export const PROFILE_TOP_PROJECTS = 3;

export const EMPTY_PROFILE_SUMMARY: ProfileSummaryData = {
  hasData: false,
  completed: 0,
  completionRate: 0,
  active: 0,
  overdue: 0,
  completedThisWeek: 0,
  streakDays: 0,
  projectCount: 0,
  weeklyCompleted: Array.from({ length: PROFILE_WEEKS }, () => 0),
  weekDelta: 0,
  bestWeek: 0,
  topProjects: [],
  monthsInMotio: null,
};

interface ComputeProfileSummaryArgs {
  tasks: Task[];
  statuses: Status[];
  projects: Project[];
  assignees: Assignee[];
  userId: string | null | undefined;
  /** Supabase auth `user.created_at` (ISO). */
  accountCreatedAt: string | null | undefined;
  /** Today as `yyyy-MM-dd` (local). */
  todayKey: string;
}

const toDateKey = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const parsed = parseISO(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, 'yyyy-MM-dd');
};

export const computeProfileSummary = ({
  tasks,
  statuses,
  projects,
  assignees,
  userId,
  accountCreatedAt,
  todayKey,
}: ComputeProfileSummaryArgs): ProfileSummaryData => {
  const today = parseISO(todayKey);

  const createdKey = toDateKey(accountCreatedAt);
  const monthsInMotio = createdKey
    ? Math.max(0, differenceInCalendarMonths(today, parseISO(createdKey)))
    : null;

  const assigneeId = resolveCurrentUserAssigneeId(assignees, userId);
  if (!assigneeId) {
    return { ...EMPTY_PROFILE_SUMMARY, monthsInMotio };
  }

  const myTasks = tasks.filter((task) => task.assigneeIds.includes(assigneeId));
  if (myTasks.length === 0) {
    return { ...EMPTY_PROFILE_SUMMARY, monthsInMotio };
  }

  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const projectCounts = new Map<string, number>();
  const completionDayKeys = new Set<string>();

  let completed = 0;
  let startedTotal = 0;
  let startedCompleted = 0;
  let active = 0;
  let overdue = 0;
  // weekly[0] is the oldest window, weekly[PROFILE_WEEKS - 1] the current one.
  const weekly = Array.from({ length: PROFILE_WEEKS }, () => 0);

  myTasks.forEach((task) => {
    const status = statusById.get(task.statusId);
    const isFinal = status?.isFinal ?? false;
    const isCancelled = status?.isCancelled ?? false;

    if (isTaskStartedBy(task.startDate, todayKey)) {
      startedTotal += 1;
      if (isFinal) startedCompleted += 1;
    }

    if (isFinal) {
      completed += 1;
      // `updatedAt` is the best proxy we have for "finished at" — it's noisy
      // (a late edit bumps it), so streak/this-week are intentionally fuzzy.
      const doneKey = toDateKey(task.updatedAt);
      if (doneKey) {
        completionDayKeys.add(doneKey);
        const diff = differenceInCalendarDays(today, parseISO(doneKey));
        const weeksAgo = Math.floor(diff / 7);
        if (diff >= 0 && weeksAgo < PROFILE_WEEKS) weekly[PROFILE_WEEKS - 1 - weeksAgo] += 1;
      }
    } else if (!isCancelled) {
      active += 1;
      if (task.endDate && task.endDate < todayKey) overdue += 1;
    }

    if (task.projectId) {
      projectCounts.set(task.projectId, (projectCounts.get(task.projectId) ?? 0) + 1);
    }
  });

  // Walk back from today; allow one day of grace so the streak doesn't read as
  // broken simply because nothing has been finished *yet* today.
  let streakDays = 0;
  if (completionDayKeys.size > 0) {
    let cursor = completionDayKeys.has(format(today, 'yyyy-MM-dd')) ? today : addDays(today, -1);
    while (completionDayKeys.has(format(cursor, 'yyyy-MM-dd'))) {
      streakDays += 1;
      cursor = addDays(cursor, -1);
    }
  }

  // Shares are of the tasks that have a project, so the listed projects plus
  // "N more" add up to the whole. Ties keep insertion order (stable sort).
  let projectTaskTotal = 0;
  projectCounts.forEach((count) => {
    projectTaskTotal += count;
  });
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const topProjects: ProfileTopProject[] = [...projectCounts.entries()]
    .filter(([id]) => projectNameById.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, PROFILE_TOP_PROJECTS)
    .map(([id, count]) => ({
      id,
      name: projectNameById.get(id) ?? '',
      share: Math.round((count / projectTaskTotal) * 100),
    }));

  const completedThisWeek = weekly[PROFILE_WEEKS - 1];

  return {
    hasData: true,
    completed,
    completionRate: toCompletionPercent(startedCompleted, startedTotal),
    active,
    overdue,
    completedThisWeek,
    streakDays,
    projectCount: projectCounts.size,
    weeklyCompleted: weekly,
    weekDelta: completedThisWeek - weekly[PROFILE_WEEKS - 2],
    bestWeek: Math.max(...weekly),
    topProjects,
    monthsInMotio,
  };
};

const stripTrailingZero = (value: number): string => {
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
};

/**
 * Keeps the stat tiles narrow once counts grow: 1_500 → "1.5K",
 * 2_000_000 → "2M". Below 1000 the raw integer is returned. The suffix is
 * localized — Cyrillic К/М for Russian, Latin K/M otherwise.
 */
export const formatCompactCount = (value: number, locale = 'en'): string => {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const [thousands, millions] = locale.startsWith('ru') ? ['К', 'М'] : ['K', 'M'];
  if (abs >= 1_000_000) return `${stripTrailingZero(rounded / 1_000_000)}${millions}`;
  if (abs >= 1_000) return `${stripTrailingZero(rounded / 1_000)}${thousands}`;
  return String(rounded);
};
