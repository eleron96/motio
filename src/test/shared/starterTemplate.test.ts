import { describe, expect, it } from 'vitest';
import {
  buildStarterTemplatePayload,
  daysUntilWeekday,
  findStarterTemplateProblems,
  starterCatalogAsWorkspaceTemplate,
  type StarterTemplateContent,
} from '@/shared/domain/starterTemplate';
import { diffWorkspaceTemplate } from '@/shared/domain/workspaceTemplate';

const content = (overrides: Partial<StarterTemplateContent> = {}): StarterTemplateContent => ({
  statuses: [
    { key: 'todo', name: 'To do', emoji: '📝', color: '#94a3b8' },
    { key: 'done', name: 'Done', emoji: '✅', color: '#22c55e', isFinal: true },
  ],
  taskTypes: [{ key: 'work', name: 'Work' }],
  tags: [{ key: 'arch', name: 'Architecture', color: '#8b5cf6' }],
  projects: [{ key: 'house', name: 'House', code: 'HSE', color: '#3b82f6' }],
  people: [{ key: 'anna', name: 'Anna' }],
  tasks: [],
  milestones: [],
  timeOff: [],
  ...overrides,
});

// 2026-11-04 is a Wednesday.
const WEDNESDAY = new Date(2026, 10, 4);

describe('daysUntilWeekday', () => {
  it('counts today itself and wraps over the weekend', () => {
    expect(daysUntilWeekday(WEDNESDAY, 3)).toBe(0);
    expect(daysUntilWeekday(WEDNESDAY, 5)).toBe(2);
    expect(daysUntilWeekday(WEDNESDAY, 1)).toBe(5);
  });
});

describe('buildStarterTemplatePayload', () => {
  it('turns lengths into inclusive end days and keeps unlinked tasks unlinked', () => {
    const payload = buildStarterTemplatePayload(content({
      tasks: [
        { title: 'Plans', project: 'house', people: ['anna'], status: 'todo', type: 'work', tags: ['arch'], start: -2, days: 3 },
        { title: 'Call', people: [], status: 'todo', type: 'work', start: 4 },
      ],
      timeOff: [{ person: 'anna', start: 7, days: 5, note: 'Vacation' }],
    }), WEDNESDAY);

    expect(payload.tasks).toEqual([
      { title: 'Plans', project: 'house', people: ['anna'], status: 'todo', type: 'work', tags: ['arch'], start: -2, end: 0, repeat: null, repeat_ends: null },
      { title: 'Call', project: null, people: [], status: 'todo', type: 'work', tags: [], start: 4, end: 4, repeat: null, repeat_ends: null },
    ]);
    expect(payload.time_off).toEqual([{ person: 'anna', start: 7, end: 11, note: 'Vacation' }]);
    expect(payload.statuses[1]).toMatchObject({ is_final: true, is_cancelled: false });
  });

  /**
   * A series lives in the database as its occurrences sharing one repeat id;
   * the cadence is read back from their spacing. So a weekly meeting becomes
   * one row per week, starting on the next matching weekday.
   */
  it('expands a weekly series from the next matching weekday', () => {
    const payload = buildStarterTemplatePayload(content({
      tasks: [{
        title: 'Weekly sync',
        people: ['anna'],
        status: 'todo',
        type: 'work',
        start: 0,
        repeat: { key: 'sync', weekday: 1, count: 3 },
      }],
    }), WEDNESDAY);

    expect(payload.tasks.map((task) => [task.start, task.end, task.repeat, task.repeat_ends])).toEqual([
      [5, 5, 'sync', 'after'],
      [12, 12, 'sync', 'after'],
      [19, 19, 'sync', 'after'],
    ]);
  });
});

describe('findStarterTemplateProblems', () => {
  it('finds nothing in a consistent template', () => {
    expect(findStarterTemplateProblems(content())).toEqual([]);
  });

  it('names links to keys that do not exist', () => {
    const problems = findStarterTemplateProblems(content({
      tasks: [{ title: 'Plans', project: 'ghost', people: ['bob'], status: 'nope', type: 'work', tags: ['x'], start: 0 }],
      milestones: [{ project: 'ghost', title: 'Handover', day: 3 }],
    }));

    expect(problems).toEqual([
      'Plans: unknown project ghost',
      'Plans: unknown status nope',
      'Plans: unknown person bob',
      'Plans: unknown tag x',
      'Handover: unknown project ghost',
    ]);
  });

  it('catches what a database constraint would reject', () => {
    const problems = findStarterTemplateProblems(content({
      statuses: [
        { key: 'a', name: 'Check', emoji: '', color: '#000' },
        { key: 'b', name: 'check ', emoji: '', color: '#000', isFinal: true },
      ],
      timeOff: [
        { person: 'anna', start: 1, days: 3 },
        { person: 'anna', start: 3, days: 2 },
      ],
    }));

    expect(problems).toContain('duplicate status check');
    expect(problems).toContain('time off of anna overlaps');
  });
});

describe('starterCatalogAsWorkspaceTemplate', () => {
  /**
   * In a workspace in use a template may only add catalogs: the examples are
   * left out, and names already there — in any case — are not added again.
   */
  it('keeps only the catalogs and adds nothing the workspace already has', () => {
    const template = starterCatalogAsWorkspaceTemplate(content({
      tasks: [{ title: 'Plans', people: ['anna'], status: 'todo', type: 'work', start: 0 }],
    }));

    expect(template).toEqual({
      statuses: [
        { name: 'To do', emoji: '📝', color: '#94a3b8', is_final: false, is_cancelled: false },
        { name: 'Done', emoji: '✅', color: '#22c55e', is_final: true, is_cancelled: false },
      ],
      taskTypes: [{ name: 'Work', icon: null }],
      tags: [{ name: 'Architecture', color: '#8b5cf6' }],
    });

    const missing = diffWorkspaceTemplate(template, {
      statuses: [{ name: 'To Do' }, { name: 'Done' }],
      taskTypes: [],
      tags: [{ name: 'architecture ' }],
    });
    expect([missing.statuses.length, missing.taskTypes.length, missing.tags.length]).toEqual([0, 1, 0]);
  });
});
