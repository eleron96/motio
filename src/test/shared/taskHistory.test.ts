import { describe, expect, it } from 'vitest';
import {
  groupTaskHistoryByDay,
  toTaskHistoryEntries,
  type TaskHistoryRow,
} from '@/shared/domain/taskHistory';

const row = (overrides: Partial<TaskHistoryRow>): TaskHistoryRow => ({
  id: 'h1',
  actor_id: 'anna',
  kind: 'dates',
  old_value: null,
  new_value: null,
  created_at: '2026-03-10T09:00:00.000Z',
  ...overrides,
});

describe('task history', () => {
  it('reads a move as its dates before and after', () => {
    const [entry] = toTaskHistoryEntries([row({
      old_value: { start: '2026-03-02', end: '2026-03-04' },
      new_value: { start: '2026-03-09', end: '2026-03-11' },
    })]);

    expect(entry).toEqual({
      id: 'h1',
      actorId: 'anna',
      at: '2026-03-10T09:00:00.000Z',
      change: {
        kind: 'dates',
        from: { start: '2026-03-02', end: '2026-03-04' },
        to: { start: '2026-03-09', end: '2026-03-11' },
      },
    });
  });

  it('reads who was added to and who was removed from the assignees', () => {
    const [entry] = toTaskHistoryEntries([row({
      kind: 'assignees',
      old_value: { v: ['boris', 'anna'] },
      new_value: { v: ['anna', 'vera'] },
    })]);

    expect(entry.change).toEqual({ kind: 'assignees', added: ['vera'], removed: ['boris'] });
  });

  it('reads a project that was cleared and a status that was changed', () => {
    const entries = toTaskHistoryEntries([
      row({ id: 'p', kind: 'project', old_value: { v: 'project-1' }, new_value: { v: null } }),
      row({ id: 's', kind: 'status', old_value: { v: 'open' }, new_value: { v: 'done' } }),
    ]);

    expect(entries.map((entry) => entry.change)).toEqual([
      { kind: 'project', from: 'project-1', to: null },
      { kind: 'status', from: 'open', to: 'done' },
    ]);
  });

  it('keeps no text for a description edit', () => {
    const [entry] = toTaskHistoryEntries([row({
      kind: 'description',
      old_value: { v: 'aaa' },
      new_value: { v: 'bbb' },
    })]);

    expect(entry.change).toEqual({ kind: 'description' });
  });

  it('skips rows of an unknown kind or with a broken value', () => {
    expect(toTaskHistoryEntries([
      row({ kind: 'priority', old_value: { v: 'low' }, new_value: { v: 'high' } }),
      row({ kind: 'dates', old_value: { start: '2026-03-02' }, new_value: null }),
      row({ kind: 'title', old_value: { v: 1 }, new_value: { v: 'New' } }),
    ])).toEqual([]);
  });

  it('cuts the list into days without reordering it', () => {
    const entries = toTaskHistoryEntries([
      row({ id: 'c', kind: 'description', created_at: new Date(2026, 2, 11, 16, 0).toISOString() }),
      row({ id: 'b', kind: 'description', created_at: new Date(2026, 2, 11, 9, 0).toISOString() }),
      row({ id: 'a', kind: 'description', created_at: new Date(2026, 2, 10, 23, 30).toISOString() }),
    ]);

    expect(groupTaskHistoryByDay(entries).map((day) => [day.day, day.entries.map((entry) => entry.id)]))
      .toEqual([['2026-03-11', ['c', 'b']], ['2026-03-10', ['a']]]);
  });
});
