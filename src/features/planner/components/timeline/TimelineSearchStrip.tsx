import React, { useMemo } from 'react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { useTimelineTaskSearchNavigation } from '@/features/planner/hooks/useTimelineTaskSearch';
import { isSearchableQuery, layoutTaskSearchStrip } from '@/shared/domain/taskSearch';
import { format, parseISO } from '@/features/planner/lib/dateUtils';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';

/**
 * Every match on one time axis, under the toolbar while searching: a tick per
 * task in its project's colour (hollow when the filters hide it), a frame for
 * the days on screen. A tick takes the timeline to that task.
 */
export const TimelineSearchStrip: React.FC = () => {
  const open = useTaskSearchStore((state) => state.open);
  const query = useTaskSearchStore((state) => state.query);
  const hits = useTaskSearchStore((state) => state.hits);
  const hiddenHitIds = useTaskSearchStore((state) => state.hiddenHitIds);
  const focusedId = useTaskSearchStore((state) => state.focusedId);
  const visibleRange = useTaskSearchStore((state) => state.visibleRange);
  const projects = usePlannerStore((state) => state.projects);
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { focusHit } = useTimelineTaskSearchNavigation();

  const layout = useMemo(() => layoutTaskSearchStrip(hits, visibleRange), [hits, visibleRange]);
  const colorByProjectId = useMemo(
    () => new Map(projects.map((project) => [project.id, project.color])),
    [projects],
  );

  if (!open || !isSearchableQuery(query) || !layout) return null;
  const hitById = new Map(hits.map((hit) => [hit.id, hit]));

  return (
    <div className="border-b border-border bg-card px-2 pb-2 md:px-4 animate-in fade-in slide-in-from-top-1 duration-200">
      <div
        className="relative h-9 rounded-lg bg-muted/50"
        role="group"
        aria-label={t`Matches over time`}
      >
        {layout.months.map((month) => (
          <span
            key={month.key}
            className="pointer-events-none absolute top-1 text-[10px] lowercase text-muted-foreground/80"
            style={{ left: `calc(${month.offset * 100}% + 6px)` }}
          >
            {format(parseISO(month.key), month.key.endsWith('-01-01') ? 'LLL yyyy' : 'LLL', { locale: dateLocale })}
          </span>
        ))}
        {layout.window && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 top-[15px] rounded-md border-[1.5px] border-foreground/80 bg-background/60 transition-[left,width] duration-300 ease-out"
            style={{ left: `${layout.window.offset * 100}%`, width: `${layout.window.width * 100}%` }}
          />
        )}
        {layout.ticks.map((tick) => {
          const hit = hitById.get(tick.id);
          if (!hit) return null;
          const hidden = hiddenHitIds.has(hit.id);
          const color = (hit.projectId && colorByProjectId.get(hit.projectId)) || DEFAULT_NEUTRAL_COLOR;
          return (
            <button
              key={tick.id}
              type="button"
              onClick={() => focusHit(hit)}
              className={cn(
                'absolute bottom-[6px] h-3.5 w-1.5 -translate-x-1/2 rounded-full transition-transform hover:scale-y-125',
                focusedId === hit.id && 'scale-y-125 ring-2 ring-foreground ring-offset-1 ring-offset-card',
              )}
              style={{
                left: `${tick.offset * 100}%`,
                background: hidden ? 'transparent' : color,
                boxShadow: hidden ? `inset 0 0 0 1.5px ${color}` : undefined,
              }}
              title={`${hit.title} · ${format(parseISO(hit.startDate), 'd MMM', { locale: dateLocale })}${hidden ? ` · ${t`hidden by filters`}` : ''}`}
              aria-label={hit.title}
            />
          );
        })}
      </div>
    </div>
  );
};
