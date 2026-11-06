import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Filters, TaskSearchHit } from '@/features/planner/types/planner';

type SearchResult = { tasks: TaskSearchHit[]; error?: string };

const mocks = vi.hoisted(() => ({ searchTasks: vi.fn() }));

vi.mock('@/features/planner/store/plannerStore', async () => {
  const { create } = await import('zustand');
  return {
    usePlannerStore: create(() => ({
      workspaceId: 'workspace-a',
      tasks: [],
      filters: undefined,
      assignees: [],
      memberGroupAssignments: [],
      searchTasks: mocks.searchTasks,
    })),
  };
});

vi.mock('@/features/auth/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ currentWorkspaceId: 'workspace-a' })) };
});

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTimelineTaskSearchRunner } from '@/features/planner/hooks/useTimelineTaskSearch';

const filters = (patch: Partial<Filters> = {}): Filters => ({
  projectIds: [], assigneeIds: [], groupIds: [], statusIds: [],
  typeIds: [], tagIds: [], hideUnassigned: false,
  ...patch,
});

const task = (id: string, patch: Partial<TaskSearchHit> = {}): TaskSearchHit => ({
  id,
  title: 'Prepare the offer',
  projectId: 'project-a',
  assigneeIds: [],
  startDate: '2026-11-06',
  endDate: '2026-11-06',
  statusId: 'open',
  typeId: 'task',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: null,
  ...patch,
});

const deferredResult = () => {
  let resolve!: (result: SearchResult) => void;
  const promise = new Promise<SearchResult>((done) => { resolve = done; });
  return { promise, resolve };
};

const search = (query: string) => {
  act(() => {
    useTaskSearchStore.getState().openSearch();
    useTaskSearchStore.getState().setQuery(query);
  });
};

const elapseDebounce = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
};

describe('useTimelineTaskSearchRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
    mocks.searchTasks.mockReset().mockResolvedValue({ tasks: [] });
    useTaskSearchStore.getState().closeSearch();
    useAuthStore.setState({ currentWorkspaceId: 'workspace-a' });
    usePlannerStore.setState({
      workspaceId: 'workspace-a',
      tasks: [], filters: filters(), assignees: [], memberGroupAssignments: [],
      searchTasks: mocks.searchTasks,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows local title matches immediately and adds a subtask-only server match after the pause', async () => {
    const local = task('local', { title: 'Review the offer' });
    const parent = task('parent', { matchedSubtaskTitle: 'Review the drawing' });
    usePlannerStore.setState({ tasks: [local, task('parent')] });
    mocks.searchTasks.mockResolvedValue({ tasks: [parent] });
    renderHook(() => useTimelineTaskSearchRunner());

    search('review');
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['local']);
    expect(mocks.searchTasks).not.toHaveBeenCalled();
    await elapseDebounce();

    expect(new Set(useTaskSearchStore.getState().hits.map((hit) => hit.id))).toEqual(new Set(['local', 'parent']));
    expect(useTaskSearchStore.getState().hits.find((hit) => hit.id === 'parent')).toMatchObject({
      title: 'Prepare the offer', matchedSubtaskTitle: 'Review the drawing',
    });
    expect(useTaskSearchStore.getState().matchedTaskIds.has('parent')).toBe(true);
    expect(mocks.searchTasks).toHaveBeenCalledWith('workspace-a', 'review');
  });

  it('merges server match evidence into the latest local task and uses filters changed while waiting', async () => {
    const response = deferredResult();
    mocks.searchTasks.mockReturnValue(response.promise);
    usePlannerStore.setState({ tasks: [task('parent')], filters: filters({ statusIds: ['open'] }) });
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    await elapseDebounce();

    const latest = task('parent', {
      title: 'Updated parent title', startDate: '2026-12-01', endDate: '2026-12-02', statusId: 'done',
    });
    act(() => {
      usePlannerStore.setState({ tasks: [latest], filters: filters({ statusIds: ['done'] }) });
    });
    await act(async () => {
      response.resolve({ tasks: [task('parent', { matchedSubtaskTitle: 'Review the drawing' })] });
    });

    expect(useTaskSearchStore.getState().hits).toEqual([
      { ...latest, matchedSubtaskTitle: 'Review the drawing' },
    ]);
    expect(useTaskSearchStore.getState().hiddenHitIds.size).toBe(0);

    act(() => { usePlannerStore.setState({ filters: filters({ statusIds: ['open'] }) }); });
    expect(useTaskSearchStore.getState().hiddenHitIds.has('parent')).toBe(true);
    await elapseDebounce();
    expect(mocks.searchTasks).toHaveBeenCalledTimes(1);
  });

  it('does not reuse server hits across workspaces or revive a prior workspace response', async () => {
    const first = deferredResult();
    const second = deferredResult();
    mocks.searchTasks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    await elapseDebounce();

    act(() => { useAuthStore.setState({ currentWorkspaceId: 'workspace-b' }); });
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    await elapseDebounce();
    await act(async () => { second.resolve({ tasks: [task('b', { matchedSubtaskTitle: 'Review B' })] }); });
    await act(async () => { first.resolve({ tasks: [task('a', { matchedSubtaskTitle: 'Review A' })] }); });
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['b']);

    act(() => { useAuthStore.setState({ currentWorkspaceId: 'workspace-a' }); });
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    expect(useTaskSearchStore.getState().matchedTaskIds.size).toBe(0);
    await elapseDebounce();
    expect(mocks.searchTasks).toHaveBeenCalledTimes(3);
  });

  it('hides the previous workspace\'s loaded tasks before its replacement window arrives', async () => {
    usePlannerStore.setState({ tasks: [task('old-local', { title: 'Review old workspace' })] });
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['old-local']);

    act(() => { useAuthStore.setState({ currentWorkspaceId: 'workspace-b' }); });
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    expect(useTaskSearchStore.getState().matchedTaskIds.size).toBe(0);

    act(() => {
      usePlannerStore.setState({
        workspaceId: 'workspace-b',
        tasks: [task('new-local', { title: 'Review new workspace' })],
      });
    });
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['new-local']);
    await elapseDebounce();
    expect(mocks.searchTasks).toHaveBeenCalledTimes(1);
    expect(mocks.searchTasks).toHaveBeenCalledWith('workspace-b', 'review');
  });

  it('does not revive a completed workspace cache when returning before the next workspace responds', async () => {
    const secondWorkspace = deferredResult();
    const returnedWorkspace = deferredResult();
    mocks.searchTasks
      .mockResolvedValueOnce({ tasks: [task('old-a', { matchedSubtaskTitle: 'Review old A' })] })
      .mockReturnValueOnce(secondWorkspace.promise)
      .mockReturnValueOnce(returnedWorkspace.promise);
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    await elapseDebounce();
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['old-a']);

    act(() => { useAuthStore.setState({ currentWorkspaceId: 'workspace-b' }); });
    await elapseDebounce();
    act(() => { useAuthStore.setState({ currentWorkspaceId: 'workspace-a' }); });
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    expect(useTaskSearchStore.getState().matchedTaskIds.size).toBe(0);
    await elapseDebounce();

    await act(async () => {
      secondWorkspace.resolve({ tasks: [task('b', { matchedSubtaskTitle: 'Review B' })] });
    });
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    expect(useTaskSearchStore.getState().searching).toBe(true);
    await act(async () => {
      returnedWorkspace.resolve({ tasks: [task('fresh-a', { matchedSubtaskTitle: 'Review fresh A' })] });
    });
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['fresh-a']);
    expect(mocks.searchTasks).toHaveBeenCalledTimes(3);
  });

  it('ignores a late answer for a previous query', async () => {
    const first = deferredResult();
    const second = deferredResult();
    mocks.searchTasks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    await elapseDebounce();
    search('approve');
    await elapseDebounce();
    await act(async () => { second.resolve({ tasks: [task('approval', { matchedSubtaskTitle: 'Approve offer' })] }); });
    await act(async () => { first.resolve({ tasks: [task('review', { matchedSubtaskTitle: 'Review offer' })] }); });

    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['approval']);
    expect(useTaskSearchStore.getState().searching).toBe(false);
  });

  it('requires two characters and clears the cached server hits when the query becomes too short', async () => {
    mocks.searchTasks.mockResolvedValueOnce({ tasks: [task('server', { matchedSubtaskTitle: 'Review offer' })] });
    renderHook(() => useTimelineTaskSearchRunner());
    search('r');
    await elapseDebounce();
    expect(mocks.searchTasks).not.toHaveBeenCalled();
    expect(useTaskSearchStore.getState().hits).toEqual([]);

    search('review');
    await elapseDebounce();
    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['server']);
    search(' r ');
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    expect(useTaskSearchStore.getState().matchedTaskIds.size).toBe(0);
    expect(useTaskSearchStore.getState().searching).toBe(false);

    search('review');
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    await elapseDebounce();
    expect(useTaskSearchStore.getState().hits).toEqual([]);
    expect(mocks.searchTasks).toHaveBeenCalledTimes(2);
  });

  it('keeps local hits after a failed search without retaining another query\'s server hits', async () => {
    mocks.searchTasks
      .mockResolvedValueOnce({ tasks: [task('server', { matchedSubtaskTitle: 'Review offer' })] })
      .mockResolvedValueOnce({ tasks: [], error: 'Unavailable' });
    usePlannerStore.setState({ tasks: [task('local', { title: 'Approve offer' })] });
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    await elapseDebounce();
    search('approve');
    await elapseDebounce();

    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['local']);
    expect(useTaskSearchStore.getState().matchedTaskIds.has('server')).toBe(false);
    expect(useTaskSearchStore.getState().searching).toBe(false);
    search('review');
    expect(useTaskSearchStore.getState().hits).toEqual([]);
  });

  it('keeps every matching repeat bar in the match set while listing only the nearest occurrence', async () => {
    const near = task('near', { repeatId: 'series', matchedSubtaskTitle: 'Review current offer' });
    const far = task('far', {
      repeatId: 'series', startDate: '2027-02-01', endDate: '2027-02-01', matchedSubtaskTitle: 'Review future offer',
    });
    mocks.searchTasks.mockResolvedValue({ tasks: [far, near] });
    renderHook(() => useTimelineTaskSearchRunner());
    search('review');
    await elapseDebounce();

    expect(useTaskSearchStore.getState().hits.map((hit) => hit.id)).toEqual(['near']);
    expect(useTaskSearchStore.getState().matchedTaskIds).toEqual(new Set(['near', 'far']));
  });
});
