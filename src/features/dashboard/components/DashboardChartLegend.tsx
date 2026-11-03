import React from 'react';
import { cn } from '@/shared/lib/classNames';
import { useLocaleStore } from '@/shared/store/localeStore';
import { localeIntlTags } from '@/shared/lib/locale';

interface DashboardChartLegendProps {
  items: Array<{ name: string; value: number }>;
  columns: number;
  textClass: string;
  /** Pie legends run smaller: tighter gaps, smaller dots. */
  isPie: boolean;
  showValue: boolean;
  getSeriesColor: (seriesNameOrKey: string, index: number) => string;
  formatName: (name: string) => string;
  /** "+N hidden" under the items, when some were folded away. */
  hint: string | null;
}

/** A chart widget's legend: a dot, a name and (when there is room) the value per series. */
export const DashboardChartLegend: React.FC<DashboardChartLegendProps> = ({
  items,
  columns,
  textClass,
  isPie,
  showValue,
  getSeriesColor,
  formatName,
  hint,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  return (
    <div className="min-w-0 overflow-hidden">
      <div
        className={cn(
          'grid w-full max-w-full text-muted-foreground',
          isPie ? 'gap-x-2 gap-y-1' : 'gap-x-2.5 gap-y-1',
          textClass,
        )}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item, index) => {
          const legendName = formatName(item.name);
          return (
            <div
              key={`${item.name}-${index}`}
              className={cn('flex min-w-0 items-center', showValue ? 'gap-1.5' : 'gap-1')}
            >
              <span
                className={cn('rounded-full', isPie ? 'h-1.5 w-1.5' : 'h-2 w-2')}
                style={{
                  backgroundColor: getSeriesColor(item.name, index),
                }}
              />
              <span className="min-w-0 truncate text-muted-foreground">
                {legendName}
              </span>
              {showValue && (
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {item.value.toLocaleString(localeIntlTags[locale])}
                </span>
              )}
            </div>
          );
        })}
        {hint && (
          <div className="col-span-full text-[10px] leading-snug text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
};
