import React from 'react';
import { t } from '@lingui/macro';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { ADMIN_PAGE_SIZES, type AdminPageSize } from '@/features/admin/hooks/useTablePagination';

interface AdminTablePaginationProps {
  page: number;
  pageCount: number;
  pageSize: AdminPageSize;
  total: number;
  firstRow: number;
  lastRow: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: AdminPageSize) => void;
}

/**
 * Page controls for the admin tables: how many rows at a time, and where in the
 * list you are. Shown even on a single page — the size is a standing choice,
 * not something that only matters once a list grows.
 */
export const AdminTablePagination: React.FC<AdminTablePaginationProps> = ({
  page,
  pageCount,
  pageSize,
  total,
  firstRow,
  lastRow,
  onPageChange,
  onPageSizeChange,
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t`Rows per page`}</span>
      <SegmentedControl surface="compact">
        {ADMIN_PAGE_SIZES.map((size) => (
          <SegmentedControlItem
            key={size}
            active={pageSize === size}
            onClick={() => onPageSizeChange(size)}
          >
            {size}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>

    <div className="flex items-center gap-3">
      <span className="text-xs tabular-nums text-muted-foreground">
        {total === 0 ? t`Nothing to show` : t`${firstRow}–${lastRow} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label={t`Previous page`}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[64px] text-center text-xs tabular-nums text-muted-foreground">
          {t`${page} of ${pageCount}`}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label={t`Next page`}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
);
