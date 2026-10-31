import { describe, expect, it } from 'vitest';
import { selectSearchQueryForTitle } from '@/features/planner/store/taskSearchStore';

const state = (open: boolean, query: string) => ({ open, query }) as Parameters<ReturnType<typeof selectSearchQueryForTitle>>[0];

describe('selectSearchQueryForTitle', () => {
  it('gives a bar the query only while its title contains it', () => {
    const select = selectSearchQueryForTitle('Ёлка в офисе');
    expect(select(state(true, 'елк'))).toBe('елк');
    expect(select(state(true, 'бюджет'))).toBe('');
  });

  it('stays empty while the search is closed or the query is empty', () => {
    const select = selectSearchQueryForTitle('Brand guide');
    expect(select(state(false, 'brand'))).toBe('');
    expect(select(state(true, ''))).toBe('');
  });

  it('returns the same empty value for every keystroke a bar does not match', () => {
    const select = selectSearchQueryForTitle('Release notes');
    expect(select(state(true, 'bu'))).toBe(select(state(true, 'bud')));
  });
});
