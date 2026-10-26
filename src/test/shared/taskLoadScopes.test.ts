import { describe, expect, it } from 'vitest';
import {
  BOARD_RECENTLY_CHANGED_DAYS,
  buildBoardScope,
  isTaskInBoardScope,
  isTaskInLoadScopes,
  isTaskInWindow,
  mergeBoardLoad,
  mergeWindowLoad,
  pruneToWindow,
  windowContains,
  type TaskBoardScope,
} from '@/shared/domain/taskLoadScopes';
import type { Task } from '@/features/planner/types/planner';

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  title: 'Task',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-03-10',
  endDate: '2026-03-12',
  statusId: 'status-open',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const window = { start: '2026-03-01', end: '2026-03-31' };
const board: TaskBoardScope = {
  workspaceId: 'ws-1',
  openStatusIds: ['status-open', 'status-review'],
  recentlySince: '2026-03-01T00:00:00.000Z',
};

describe('taskLoadScopes', () => {
  it('matches a window by overlapping dates, including the edges', () => {
    expect(isTaskInWindow(makeTask({ startDate: '2026-02-20', endDate: '2026-03-01' }), window)).toBe(true);
    expect(isTaskInWindow(makeTask({ startDate: '2026-03-31', endDate: '2026-04-05' }), window)).toBe(true);
    expect(isTaskInWindow(makeTask({ startDate: '2026-02-01', endDate: '2026-02-28' }), window)).toBe(false);
    expect(isTaskInWindow(makeTask({ startDate: '2026-04-01', endDate: '2026-04-02' }), window)).toBe(false);
  });

  it('checks window containment', () => {
    expect(windowContains({ start: '2025-03-01', end: '2027-03-01' }, window)).toBe(true);
    expect(windowContains(window, window)).toBe(true);
    expect(windowContains(window, { start: '2026-02-28', end: '2026-03-31' })).toBe(false);
  });

  it('claims open tasks and recently changed ones for the board', () => {
    expect(isTaskInBoardScope(makeTask({ statusId: 'status-review' }), board)).toBe(true);
    expect(isTaskInBoardScope(makeTask({ statusId: 'status-done', updatedAt: '2026-03-05T10:00:00+00:00' }), board)).toBe(true);
    expect(isTaskInBoardScope(makeTask({ statusId: 'status-done', updatedAt: '2026-02-27T10:00:00.000Z' }), board)).toBe(false);
    expect(isTaskInBoardScope(makeTask({ statusId: 'status-done', updatedAt: undefined }), board)).toBe(false);
  });

  it('combines scopes; with no board only the window counts', () => {
    const farOpenTask = makeTask({ startDate: '2027-01-01', endDate: '2027-01-01' });
    expect(isTaskInLoadScopes(farOpenTask, { window, board: null })).toBe(false);
    expect(isTaskInLoadScopes(farOpenTask, { window, board })).toBe(true);
    expect(isTaskInLoadScopes(makeTask({}), { window: null, board: null })).toBe(false);
  });

  it('builds the board scope from non-final, non-cancelled statuses', () => {
    const now = new Date('2026-03-20T12:00:00.000Z');
    const scope = buildBoardScope('ws-1', [
      { id: 'todo', isFinal: false, isCancelled: false },
      { id: 'doing', isFinal: false, isCancelled: false },
      { id: 'done', isFinal: true, isCancelled: false },
      { id: 'cancelled', isFinal: false, isCancelled: true },
    ], now);
    expect(scope.openStatusIds).toEqual(['todo', 'doing']);
    expect(Date.parse(now.toISOString()) - Date.parse(scope.recentlySince))
      .toBe(BOARD_RECENTLY_CHANGED_DAYS * 24 * 60 * 60 * 1000);
  });

  it('replaces the cache with the window rows when there is no board', () => {
    const incoming = [makeTask({ id: 'a' })];
    expect(mergeWindowLoad([makeTask({ id: 'old' })], incoming, null)).toBe(incoming);
  });

  it('keeps board-claimed tasks across a window reload, preferring fresh rows', () => {
    const existing = [
      makeTask({ id: 'shared', title: 'stale' }),
      makeTask({ id: 'board-only', startDate: '2027-01-01', endDate: '2027-01-01' }),
      makeTask({ id: 'dropped', statusId: 'status-done', startDate: '2025-01-01', endDate: '2025-01-01' }),
    ];
    const incoming = [makeTask({ id: 'shared', title: 'fresh' })];
    const merged = mergeWindowLoad(existing, incoming, board);
    expect(merged.map((task) => task.id)).toEqual(['shared', 'board-only']);
    expect(merged[0].title).toBe('fresh');
  });

  it('upserts board rows and drops tasks neither scope claims any more', () => {
    const existing = [
      makeTask({ id: 'window-task', statusId: 'status-done' }),
      makeTask({ id: 'old-board-task', startDate: '2027-01-01', endDate: '2027-01-01' }),
      makeTask({ id: 'refreshed', title: 'stale', startDate: '2027-02-01', endDate: '2027-02-01' }),
    ];
    const incoming = [
      makeTask({ id: 'refreshed', title: 'fresh', startDate: '2027-02-01', endDate: '2027-02-01' }),
      makeTask({ id: 'new-board-task', startDate: '2025-06-01', endDate: '2025-06-01' }),
    ];
    const merged = mergeBoardLoad(existing, incoming, { window, board });
    expect(merged.map((task) => task.id)).toEqual(['window-task', 'refreshed', 'new-board-task']);
    expect(merged[1].title).toBe('fresh');
  });

  it('prunes the cache back to the window, keeping the reference when nothing leaves', () => {
    const inWindow = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    expect(pruneToWindow(inWindow, window)).toBe(inWindow);
    const mixed = [...inWindow, makeTask({ id: 'far', startDate: '2027-01-01', endDate: '2027-01-01' })];
    expect(pruneToWindow(mixed, window).map((task) => task.id)).toEqual(['a', 'b']);
    expect(pruneToWindow(mixed, null)).toEqual([]);
  });
});
