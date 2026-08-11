import { describe, expect, it } from 'vitest';
import { needsAssigneeGroupingToRevealTask } from '@/shared/domain/timelineTaskReveal';

/**
 * A deep link must land on a task the user can actually see. The project board
 * drops archived projects entirely, so such a link switches to people grouping —
 * but only when the task will really show up there.
 */

const PROJECTS = [
  { id: 'live', archived: false },
  { id: 'old', archived: true },
];

const ASSIGNEES = [
  { id: 'active-1', isActive: true },
  { id: 'gone-1', isActive: false },
];

const reveal = (
  task: { projectId: string | null; assigneeIds: string[] } | null | undefined,
  groupMode: 'assignee' | 'project' = 'project',
) => needsAssigneeGroupingToRevealTask({ task, projects: PROJECTS, assignees: ASSIGNEES, groupMode });

describe('needsAssigneeGroupingToRevealTask', () => {
  it('switches when an archived project task is opened on the project board', () => {
    expect(reveal({ projectId: 'old', assigneeIds: ['active-1'] })).toBe(true);
  });

  it('switches for an unassigned task of an archived project — it gets the "no assignee" row', () => {
    expect(reveal({ projectId: 'old', assigneeIds: [] })).toBe(true);
  });

  it('leaves an active project task alone', () => {
    expect(reveal({ projectId: 'live', assigneeIds: ['active-1'] })).toBe(false);
  });

  it('never switches when the user is already grouping by people', () => {
    expect(reveal({ projectId: 'old', assigneeIds: ['active-1'] }, 'assignee')).toBe(false);
  });

  it('leaves a task without a project alone — it has its own row on the board', () => {
    expect(reveal({ projectId: null, assigneeIds: ['active-1'] })).toBe(false);
  });

  it('does not switch on an unknown or missing task', () => {
    expect(reveal({ projectId: 'gone-from-store', assigneeIds: [] })).toBe(false);
    expect(reveal(null)).toBe(false);
    expect(reveal(undefined)).toBe(false);
  });

  it('does not burn the user\'s grouping choice when people view would hide the task too', () => {
    // Все исполнители отключены — selectFilteredTasks прячет такую задачу и в
    // людской группировке, так что переключение ничего бы не показало.
    expect(reveal({ projectId: 'old', assigneeIds: ['gone-1'] })).toBe(false);
  });

  it('switches when at least one assignee is still active', () => {
    expect(reveal({ projectId: 'old', assigneeIds: ['gone-1', 'active-1'] })).toBe(true);
  });

  it('treats an assignee missing from the local cache as visible, like the timeline does', () => {
    expect(reveal({ projectId: 'old', assigneeIds: ['not-in-cache'] })).toBe(true);
  });
});
