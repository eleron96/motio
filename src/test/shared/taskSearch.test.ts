import { describe, expect, it } from 'vitest';
import {
  collectTaskSearchResults,
  findTitleMatch,
  isSearchableQuery,
  layoutTaskSearchStrip,
  splitHitsByRange,
  splitTitleAtMatch,
  type TaskSearchCandidate,
} from '@/shared/domain/taskSearch';

const task = (
  id: string,
  title: string,
  startDate: string,
  endDate = startDate,
  repeatId: string | null = null,
): TaskSearchCandidate => ({ id, title, startDate, endDate, projectId: null, repeatId });

describe('matching titles', () => {
  it('ignores case, «ё» and extra spaces in the query', () => {
    expect(findTitleMatch('Смета на фасад', 'СМЕТ')).toEqual({ start: 0, end: 4 });
    expect(findTitleMatch('Учёт материалов', 'учет')).toEqual({ start: 0, end: 4 });
    expect(findTitleMatch('Проверить  смету', '  смету ')).toEqual({ start: 11, end: 16 });
    expect(findTitleMatch('Смета', 'кровля')).toBeNull();
  });

  it('splits the title around the match for underlining', () => {
    expect(splitTitleAtMatch('Проверить смету подрядчика', 'смет')).toEqual(['Проверить ', 'смет', 'у подрядчика']);
  });

  it('needs at least two Unicode characters, matching the server', () => {
    expect(isSearchableQuery(' с ')).toBe(false);
    expect(isSearchableQuery('см')).toBe(true);
    expect(isSearchableQuery('📐')).toBe(false);
    expect(isSearchableQuery('📐с')).toBe(true);
  });
});

describe('collectTaskSearchResults', () => {
  it('merges sources by id and keeps one occurrence per series, nearest to today', () => {
    const local = [task('a', 'Смета фасад', '2026-10-28', '2026-11-04'), task('s1', 'Смета: сверка', '2026-10-01', '2026-10-01', 'r')];
    const server = [
      task('a', 'Смета фасад', '2026-10-28', '2026-11-04'),
      task('s2', 'Смета: сверка', '2026-11-05', '2026-11-05', 'r'),
      task('b', 'Обмеры', '2026-10-30'),
    ];
    const { hits, matchedTaskIds } = collectTaskSearchResults([local, server], 'смет', '2026-10-31');
    expect(hits.map((hit) => hit.id)).toEqual(['a', 's2']);
    expect([...matchedTaskIds]).toEqual(['a', 's1', 's2']);
  });

  it('keeps a subtask-only match and prefers current local task fields', () => {
    const local = task('a', 'Обмеры', '2026-11-06');
    const server = { ...local, startDate: '2026-10-01', matchedSubtaskTitle: 'Проверить смету' };
    const { hits } = collectTaskSearchResults([[local], [server]], 'СМЕТ', '2026-11-06');
    expect(hits).toEqual([{ ...local, matchedSubtaskTitle: 'Проверить смету' }]);
    expect(local).not.toHaveProperty('matchedSubtaskTitle');
  });

  it('does not resurrect an outdated title match after a local rename', () => {
    const local = task('a', 'Обмеры', '2026-11-06');
    const stale = { ...local, title: 'Смета' };
    expect(collectTaskSearchResults([[local], [stale]], 'смет', '2026-11-06').hits).toEqual([]);
  });

  it('deduplicates a task matching both titles and ignores unrelated subtask context', () => {
    const parent = { ...task('a', 'Смета', '2026-11-06'), matchedSubtaskTitle: 'Проверить смету' };
    const unrelated = { ...task('b', 'Обмеры', '2026-11-07'), matchedSubtaskTitle: 'Позвонить' };
    expect(collectTaskSearchResults([[parent], [parent, unrelated]], 'смет', '2026-11-06').hits).toEqual([parent]);
    expect(collectTaskSearchResults([[parent]], 'с', '2026-11-06').hits).toEqual([]);
  });
});

describe('splitHitsByRange', () => {
  it('separates matches before, on and after the screen', () => {
    const hits = [task('a', 'x', '2026-10-01'), task('b', 'x', '2026-10-20', '2026-10-28'), task('c', 'x', '2026-11-20')];
    const parts = splitHitsByRange(hits, { start: '2026-10-25', end: '2026-11-05' });
    expect(parts.before.map((hit) => hit.id)).toEqual(['a']);
    expect(parts.inside.map((hit) => hit.id)).toEqual(['b']);
    expect(parts.after.map((hit) => hit.id)).toEqual(['c']);
  });
});

describe('layoutTaskSearchStrip', () => {
  it('spans whole months, at least six, and places ticks and the screen frame', () => {
    const layout = layoutTaskSearchStrip(
      [task('a', 'x', '2026-10-15')],
      { start: '2026-10-27', end: '2026-11-09' },
    );
    expect(layout).not.toBeNull();
    expect(layout!.months.length).toBeGreaterThanOrEqual(6);
    expect(layout!.start.endsWith('-01')).toBe(true);
    const tick = layout!.ticks[0].offset;
    expect(tick).toBeGreaterThan(0);
    expect(tick).toBeLessThan(layout!.window!.offset);
  });

  it('is empty without matches or a screen range', () => {
    expect(layoutTaskSearchStrip([], null)).toBeNull();
  });
});
