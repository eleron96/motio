import { describe, expect, it } from 'vitest';
import { selectSearchQueryForTask, useTaskSearchStore } from '@/features/planner/store/taskSearchStore';

const state = (open: boolean, query: string, matchedTaskIds = new Set<string>()) => (
  { ...useTaskSearchStore.getState(), open, query, matchedTaskIds }
);

describe('selectSearchQueryForTask', () => {
  it('gives a bar the query only while its title contains it', () => {
    const select = selectSearchQueryForTask('task-1', 'Ёлка в офисе');
    expect(select(state(true, 'елк'))).toBe('елк');
    expect(select(state(true, 'бюджет'))).toBe('');
  });

  it('stays empty while the search is closed or the query is empty', () => {
    const select = selectSearchQueryForTask('task-1', 'Brand guide');
    expect(select(state(false, 'brand'))).toBe('');
    expect(select(state(true, ''))).toBe('');
  });

  it('returns the same empty value for every keystroke a bar does not match', () => {
    const select = selectSearchQueryForTask('task-1', 'Release notes');
    expect(select(state(true, 'bu'))).toBe(select(state(true, 'bud')));
  });

  it('keeps a parent visible for a subtask match, without highlighting unrelated titles', () => {
    const matched = state(true, 'budget', new Set(['task-1']));
    expect(selectSearchQueryForTask('task-1', 'Release')(matched)).toBe('budget');
    expect(selectSearchQueryForTask('task-2', 'Release')(matched)).toBe('');
  });

  it('clears subtask matches immediately when the query changes or search closes', () => {
    const store = useTaskSearchStore;
    store.getState().openSearch();
    store.getState().setQuery('budget');
    store.getState().setResults([], new Set(), new Set(['task-1']));
    store.getState().setQuery('release');
    expect(store.getState().matchedTaskIds.size).toBe(0);
    store.getState().setResults([], new Set(), new Set(['task-1']));
    store.getState().closeSearch();
    expect(store.getState().matchedTaskIds.size).toBe(0);
  });
});
