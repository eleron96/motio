import type { WorkspaceTemplate } from '@/shared/domain/workspaceTemplate';

/**
 * A starter template: the catalogs and the example work a new workspace begins
 * with. Written as days relative to today, so the examples always sit around
 * the week the person opens the timeline, and turned here into the payload of
 * `apply_workspace_template` (migration 0169).
 *
 * Pure on purpose: the wording of a template lives with the UI (it is
 * translated into the interface language when the template is built), the
 * shape and the date arithmetic live here.
 */

export type StarterTemplateId = 'design' | 'bim' | 'construction' | 'software' | 'empty';

/** What a new workspace starts from: a starter template, or the person's own saved set. */
export type WorkspaceStart = StarterTemplateId | 'own';

export type StarterStatus = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  isFinal?: boolean;
  isCancelled?: boolean;
};

export type StarterTaskType = { key: string; name: string };
export type StarterTag = { key: string; name: string; color: string };
export type StarterProject = { key: string; name: string; code: string; color: string };
export type StarterPerson = { key: string; name: string };

/** A weekly series: the first occurrence on the next given weekday (0 = Sunday … 6 = Saturday). */
export type StarterWeeklyRepeat = { key: string; weekday: number; count: number };

export type StarterTask = {
  title: string;
  project?: string;
  people: string[];
  status: string;
  type: string;
  tags?: string[];
  /** Days from today; negative is in the past. */
  start: number;
  /** Length in days, today counts as one. */
  days?: number;
  repeat?: StarterWeeklyRepeat;
};

export type StarterMilestone = { project: string; title: string; day: number };
export type StarterTimeOff = { person: string; start: number; days: number; note?: string };

export type StarterTemplateContent = {
  statuses: StarterStatus[];
  taskTypes: StarterTaskType[];
  tags: StarterTag[];
  projects: StarterProject[];
  people: StarterPerson[];
  tasks: StarterTask[];
  milestones: StarterMilestone[];
  timeOff: StarterTimeOff[];
};

/** What `apply_workspace_template` takes: snake_case, dates as day offsets. */
export type StarterTemplatePayload = {
  statuses: Array<{ key: string; name: string; emoji: string; color: string; is_final: boolean; is_cancelled: boolean }>;
  task_types: Array<{ key: string; name: string }>;
  tags: Array<{ key: string; name: string; color: string }>;
  projects: Array<{ key: string; name: string; code: string; color: string }>;
  people: Array<{ key: string; name: string }>;
  tasks: Array<{
    title: string;
    project: string | null;
    people: string[];
    status: string;
    type: string;
    tags: string[];
    start: number;
    end: number;
    repeat: string | null;
    repeat_ends: 'after' | null;
  }>;
  milestones: Array<{ project: string; title: string; day: number }>;
  time_off: Array<{ person: string; start: number; end: number; note: string | null }>;
};

/** Days from `today` to the next `weekday`, today itself included. */
export const daysUntilWeekday = (today: Date, weekday: number): number => (
  (((weekday - today.getDay()) % 7) + 7) % 7
);

const expandTask = (task: StarterTask, today: Date): StarterTemplatePayload['tasks'] => {
  const length = Math.max(1, task.days ?? 1);
  const base = {
    title: task.title,
    project: task.project ?? null,
    people: [...task.people],
    status: task.status,
    type: task.type,
    tags: [...(task.tags ?? [])],
  };

  if (!task.repeat) {
    return [{ ...base, start: task.start, end: task.start + length - 1, repeat: null, repeat_ends: null }];
  }

  // A series is stored as its occurrences sharing one repeat id; the cadence
  // is read back from their spacing (repeatSeries.inferRepeatCadence).
  const first = daysUntilWeekday(today, task.repeat.weekday);
  return Array.from({ length: Math.max(1, task.repeat.count) }, (_, index) => {
    const start = first + index * 7;
    return { ...base, start, end: start + length - 1, repeat: task.repeat!.key, repeat_ends: 'after' as const };
  });
};

export const buildStarterTemplatePayload = (
  content: StarterTemplateContent,
  today: Date,
): StarterTemplatePayload => ({
  statuses: content.statuses.map((status) => ({
    key: status.key,
    name: status.name,
    emoji: status.emoji,
    color: status.color,
    is_final: Boolean(status.isFinal),
    is_cancelled: Boolean(status.isCancelled),
  })),
  task_types: content.taskTypes.map(({ key, name }) => ({ key, name })),
  tags: content.tags.map(({ key, name, color }) => ({ key, name, color })),
  projects: content.projects.map(({ key, name, code, color }) => ({ key, name, code, color })),
  people: content.people.map(({ key, name }) => ({ key, name })),
  tasks: content.tasks.flatMap((task) => expandTask(task, today)),
  milestones: content.milestones.map(({ project, title, day }) => ({ project, title, day })),
  time_off: content.timeOff.map((record) => ({
    person: record.person,
    start: record.start,
    end: record.start + Math.max(1, record.days) - 1,
    note: record.note ?? null,
  })),
});

/**
 * Just the catalogs of a starter template, in the shape the "add what is
 * missing by name" path already speaks — for a workspace that is in use, where
 * catalogs may only grow and examples have no place.
 */
export const starterCatalogAsWorkspaceTemplate = (content: StarterTemplateContent): WorkspaceTemplate => ({
  statuses: content.statuses.map((status) => ({
    name: status.name,
    emoji: status.emoji || null,
    color: status.color,
    is_final: Boolean(status.isFinal),
    is_cancelled: Boolean(status.isCancelled),
  })),
  taskTypes: content.taskTypes.map((taskType) => ({ name: taskType.name, icon: null })),
  tags: content.tags.map((tag) => ({ name: tag.name, color: tag.color })),
});
