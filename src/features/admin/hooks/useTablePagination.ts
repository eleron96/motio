import { useEffect, useMemo, useState } from 'react';

export const ADMIN_PAGE_SIZES = [10, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

const DEFAULT_PAGE_SIZE: AdminPageSize = 50;

const storageKeyFor = (section: string) => `motio.admin.pageSize.${section}`;

const readStoredPageSize = (section: string): AdminPageSize => {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
  const stored = Number(window.localStorage.getItem(storageKeyFor(section)));
  return (ADMIN_PAGE_SIZES as readonly number[]).includes(stored)
    ? (stored as AdminPageSize)
    : DEFAULT_PAGE_SIZE;
};

export interface TablePagination<T> {
  /** The rows to render right now. */
  pageRows: T[];
  page: number;
  pageCount: number;
  pageSize: AdminPageSize;
  total: number;
  /** 1-based position of the first and last row on this page; 0/0 when empty. */
  firstRow: number;
  lastRow: number;
  setPage: (page: number) => void;
  setPageSize: (size: AdminPageSize) => void;
}

/**
 * Page an admin list that is already loaded in full.
 *
 * The chosen size is remembered per section: an admin who works in pages of 100
 * should not have to say so on every visit.
 *
 * `resetKey` is whatever narrows the list (a search string, a filter). When it
 * changes the view returns to the first page, because page 4 of the old result
 * means nothing in the new one.
 */
export const useTablePagination = <T,>(
  rows: T[],
  section: string,
  resetKey: string = '',
): TablePagination<T> => {
  const [pageSize, setPageSizeState] = useState<AdminPageSize>(() => readStoredPageSize(section));
  const [page, setPage] = useState(1);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  // Rows can disappear underneath the view — a delete, a refresh with fewer
  // results — so the page has to follow the list back into range.
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(total / pageSize))));
  }, [total, pageSize]);

  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const setPageSize = (size: AdminPageSize) => {
    setPageSizeState(size);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeyFor(section), String(size));
    }
  };

  return {
    pageRows,
    page: safePage,
    pageCount,
    pageSize,
    total,
    firstRow: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    lastRow: Math.min(safePage * pageSize, total),
    setPage,
    setPageSize,
  };
};
