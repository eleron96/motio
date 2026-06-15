import { describe, expect, it } from 'vitest';
import type { Assignee, Project, Status, Task } from '@/features/planner/types/planner';
import { computeProfileSummary, formatCompactCount } from '@/features/auth/lib/profileSummary';

const TODAY = '2026-06-14';

const status = (id: string, isFinal: boolean, isCancelled: boolean): Status => ({
  id,
  name: id,
  emoji: null,
  color: '#000000',
  isFinal,
  isCancelled,
});

const STATUSES: Status[] = [
  status('done', true, false),
  status('open', false, false),
  status('cancelled', false, true),
];

const ASSIGNEES: Assignee[] = [
  { id: 'me', name: 'Me', userId: 'u1', isActive: true, email: null, phone: null },
  { id: 'mate', name: 'Mate', userId: 'u2', isActive: true, email: null, phone: null },
];

const PROJECTS: Project[] = [
  { id: 'p1', name: 'Alpha', code: null, color: '#111', archived: false, customerId: null, ownerGroupId: null, status: null },
  { id: 'p2', name: 'Beta', code: null, color: '#222', archived: false, customerId: null, ownerGroupId: null, status: null },
  { id: 'p3', name: 'Gamma', code: null, color: '#333', archived: false, customerId: null, ownerGroupId: null, status: null },
];

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'statusId'>): Task => ({
  title: overrides.id,
  projectId: null,
  assigneeIds: ['me'],
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  typeId: 'type',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const TASKS: Task[] = [
  task({ id: 't1', statusId: 'done', projectId: 'p1', updatedAt: '2026-06-14T12:00:00' }),
  task({ id: 't2', statusId: 'done', projectId: 'p1', updatedAt: '2026-06-13T12:00:00' }),
  task({ id: 't3', statusId: 'done', projectId: 'p2', updatedAt: '2026-06-12T12:00:00' }),
  task({ id: 't4', statusId: 'done', projectId: 'p1', updatedAt: '2026-06-04T12:00:00' }),
  task({ id: 't5', statusId: 'open', projectId: 'p2', endDate: '2026-06-20' }),
  task({ id: 't6', statusId: 'open', projectId: 'p3', endDate: '2026-06-10' }),
  task({ id: 't7', statusId: 'cancelled', projectId: 'p3' }),
  task({ id: 't8', statusId: 'open', projectId: 'p1', assigneeIds: ['mate'], endDate: '2026-06-09' }),
];

describe('computeProfileSummary', () => {
  const summary = computeProfileSummary({
    tasks: TASKS,
    statuses: STATUSES,
    projects: PROJECTS,
    assignees: ASSIGNEES,
    userId: 'u1',
    accountCreatedAt: '2026-01-14T10:00:00',
    todayKey: TODAY,
  });

  it('counts only the current user’s tasks', () => {
    expect(summary.hasData).toBe(true);
    expect(summary.completed).toBe(4);
    expect(summary.active).toBe(2);
  });

  it('derives completion rate from completed / total', () => {
    // 4 of 7 of my tasks are final → 57%
    expect(summary.completionRate).toBe(57);
  });

  it('flags overdue open tasks and ignores someone else’s overdue task', () => {
    expect(summary.overdue).toBe(1);
  });

  it('counts finalisations within the trailing 7 days', () => {
    expect(summary.completedThisWeek).toBe(3);
  });

  it('walks consecutive finalisation days for the streak', () => {
    expect(summary.streakDays).toBe(3);
  });

  it('reports distinct projects and the most-worked one', () => {
    expect(summary.projectCount).toBe(3);
    expect(summary.topProjectName).toBe('Alpha');
  });

  it('measures whole months since the account was created', () => {
    expect(summary.monthsInMotio).toBe(5);
  });

  it('hides data but still reports tenure when the user has no assignee', () => {
    const empty = computeProfileSummary({
      tasks: TASKS,
      statuses: STATUSES,
      projects: PROJECTS,
      assignees: ASSIGNEES,
      userId: 'unknown',
      accountCreatedAt: '2026-01-14T10:00:00',
      todayKey: TODAY,
    });
    expect(empty.hasData).toBe(false);
    expect(empty.completed).toBe(0);
    expect(empty.monthsInMotio).toBe(5);
  });
});

describe('formatCompactCount', () => {
  it('returns the raw integer below 1000', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(999)).toBe('999');
  });

  it('compacts thousands with a trimmed decimal', () => {
    expect(formatCompactCount(1000)).toBe('1K');
    expect(formatCompactCount(1500)).toBe('1.5K');
    expect(formatCompactCount(15000)).toBe('15K');
  });

  it('compacts millions', () => {
    expect(formatCompactCount(1_000_000)).toBe('1M');
    expect(formatCompactCount(2_500_000)).toBe('2.5M');
  });

  it('localizes the suffix for Russian', () => {
    expect(formatCompactCount(1500, 'ru')).toBe('1.5К');
    expect(formatCompactCount(2_000_000, 'ru')).toBe('2М');
  });
});
