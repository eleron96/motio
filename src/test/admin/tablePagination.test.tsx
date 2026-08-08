import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTablePagination } from '@/features/admin/hooks/useTablePagination';

const rows = (count: number) => Array.from({ length: count }, (_, index) => `row-${index + 1}`);

describe('useTablePagination', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows one page worth of rows and counts the rest', () => {
    const { result } = renderHook(() => useTablePagination(rows(72), 'users'));

    // 50 by default: the whole list at once was the problem, ten at a time is
    // the other extreme.
    expect(result.current.pageSize).toBe(50);
    expect(result.current.pageRows).toHaveLength(50);
    expect(result.current.pageRows[0]).toBe('row-1');
    expect(result.current.pageCount).toBe(2);
    expect(result.current.firstRow).toBe(1);
    expect(result.current.lastRow).toBe(50);
    expect(result.current.total).toBe(72);
  });

  it('moves to the next page and reports the range it shows', () => {
    const { result } = renderHook(() => useTablePagination(rows(72), 'users'));

    act(() => result.current.setPage(2));

    expect(result.current.pageRows).toHaveLength(22);
    expect(result.current.pageRows[0]).toBe('row-51');
    expect(result.current.firstRow).toBe(51);
    expect(result.current.lastRow).toBe(72);
  });

  it('returns to the first page when the size changes', () => {
    const { result } = renderHook(() => useTablePagination(rows(72), 'users'));

    act(() => result.current.setPage(2));
    act(() => result.current.setPageSize(10));

    expect(result.current.page).toBe(1);
    expect(result.current.pageRows).toHaveLength(10);
    expect(result.current.pageCount).toBe(8);
  });

  it('remembers the chosen size per section', () => {
    const first = renderHook(() => useTablePagination(rows(72), 'backups'));
    act(() => first.result.current.setPageSize(100));
    first.unmount();

    const reopened = renderHook(() => useTablePagination(rows(72), 'backups'));
    expect(reopened.result.current.pageSize).toBe(100);

    // A different section keeps its own answer.
    const other = renderHook(() => useTablePagination(rows(72), 'users'));
    expect(other.result.current.pageSize).toBe(50);
  });

  it('follows the list back into range when rows disappear', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useTablePagination(data, 'users'),
      { initialProps: { data: rows(120) } },
    );

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    // A delete or a narrower refresh leaves fewer pages than the one open.
    rerender({ data: rows(60) });

    expect(result.current.page).toBe(2);
    expect(result.current.pageRows[0]).toBe('row-51');
  });

  it('goes back to the first page when the search changes', () => {
    const { result, rerender } = renderHook(
      ({ query }) => useTablePagination(rows(120), 'users', query),
      { initialProps: { query: '' } },
    );

    act(() => result.current.setPage(3));
    rerender({ query: 'anna' });

    // Page 3 of the old result says nothing about the new one.
    expect(result.current.page).toBe(1);
  });

  it('says the list is empty without offering a page to turn to', () => {
    const { result } = renderHook(() => useTablePagination([], 'users'));

    expect(result.current.pageRows).toEqual([]);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.firstRow).toBe(0);
    expect(result.current.lastRow).toBe(0);
  });
});
