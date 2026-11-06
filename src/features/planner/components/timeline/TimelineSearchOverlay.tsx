import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { useTimelineTaskSearchNavigation } from '@/features/planner/hooks/useTimelineTaskSearch';
import { isSearchableQuery, splitHitsByRange, splitTitleAtMatch } from '@/shared/domain/taskSearch';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { format, parseISO } from '@/features/planner/lib/dateUtils';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';

const PEEK_WIDTH = 272;
const PEEK_GAP = 10;
const PEEK_INSET = 8;

/**
 * Over the timeline while searching: "N earlier" / "N later" chips on its
 * edges for matches off screen, and a small card next to the focused match.
 */
export const TimelineSearchOverlay: React.FC = () => {
  const open = useTaskSearchStore((state) => state.open);
  const query = useTaskSearchStore((state) => state.query);
  const hits = useTaskSearchStore((state) => state.hits);
  const focusedId = useTaskSearchStore((state) => state.focusedId);
  const visibleRange = useTaskSearchStore((state) => state.visibleRange);
  // The "earlier" chip and the card keep off the people/projects column.
  const sidebarWidth = useTaskSearchStore((state) => state.sidebarWidth);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const statuses = usePlannerStore((state) => state.statuses);
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { focusHit, focusNext, openFocused } = useTimelineTaskSearchNavigation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const [peekPosition, setPeekPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const active = open && isSearchableQuery(query);
  const { before, after } = splitHitsByRange(hits, visibleRange);
  const focused = hits.find((hit) => hit.id === focusedId) ?? null;

  // Follow the focused bar: it moves with scrolling and appears only once the
  // timeline has loaded its days.
  useLayoutEffect(() => {
    if (!active || !focusedId) {
      setPeekPosition(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = rootRef.current;
      const peek = peekRef.current;
      const bar = root?.parentElement?.querySelector<HTMLElement>(`.task-bar[data-task-id="${focusedId}"]`);
      if (!root || !bar || !peek) {
        setPeekPosition(null);
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const minLeft = Math.max(sidebarWidth, -rootRect.left) + PEEK_INSET;
      const right = Math.min(rootRect.width, window.innerWidth - rootRect.left) - PEEK_INSET;
      const width = Math.min(PEEK_WIDTH, Math.max(0, right - minLeft));
      const left = Math.min(
        Math.max(barRect.left - rootRect.left, minLeft),
        right - width,
      );
      const minTop = Math.max(0, -rootRect.top) + PEEK_INSET;
      const bottom = Math.min(rootRect.height, window.innerHeight - rootRect.top) - PEEK_INSET;
      const maxHeight = Math.max(0, bottom - minTop);
      const height = Math.min(peek.offsetHeight, maxHeight);
      const below = barRect.bottom - rootRect.top + PEEK_GAP;
      const preferredTop = below + height > bottom
        ? barRect.top - rootRect.top - PEEK_GAP - height
        : below;
      const top = Math.max(minTop, Math.min(preferredTop, bottom - height));
      const offscreen = barRect.right < rootRect.left + sidebarWidth || barRect.left > rootRect.right;
      setPeekPosition(offscreen || !width || !maxHeight ? null : { left, top, width, maxHeight });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    // A matched subtask, translated labels or wrapping may change the card's
    // height after the first measurement. Keep the entire card in view.
    const observer = new ResizeObserver(schedule);
    if (rootRef.current) observer.observe(rootRef.current);
    if (peekRef.current) observer.observe(peekRef.current);
    // The bar may mount a moment later (a jump to other dates loads them).
    const retry = window.setInterval(schedule, 250);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      window.clearInterval(retry);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [active, focusedId, sidebarWidth]);

  if (!active) return null;

  const project = focused?.projectId ? projects.find((item) => item.id === focused.projectId) : null;
  const status = focused ? statuses.find((item) => item.id === focused.statusId) : null;
  const people = focused
    ? focused.assigneeIds.map((id) => assignees.find((item) => item.id === id)?.name).filter(Boolean).join(', ')
    : '';
  const dates = focused
    ? focused.startDate === focused.endDate
      ? format(parseISO(focused.startDate), 'd MMM', { locale: dateLocale })
      : `${format(parseISO(focused.startDate), 'd MMM', { locale: dateLocale })} – ${format(parseISO(focused.endDate), 'd MMM', { locale: dateLocale })}`
    : '';
  // The chips sit above the middle: the focused bar is scrolled to the middle
  // and its card opens under it.
  const earlierCount = before.length;
  const laterCount = after.length;
  const matchedSubtaskTitle = focused?.matchedSubtaskTitle;
  const subtaskParts = matchedSubtaskTitle ? splitTitleAtMatch(matchedSubtaskTitle, query) : null;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-40">
      {earlierCount > 0 && (
        <button
          type="button"
          onClick={() => focusHit(before[before.length - 1])}
          className="pointer-events-auto absolute top-[30%] inline-flex items-center gap-1 rounded-full bg-foreground py-1.5 pl-2 pr-3 text-xs font-medium text-background shadow-lg transition-transform hover:scale-105 animate-in fade-in slide-in-from-left-2 duration-200"
          style={{ left: sidebarWidth + 12 }}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t`${earlierCount} earlier`}
        </button>
      )}
      {laterCount > 0 && (
        <button
          type="button"
          onClick={() => focusHit(after[0])}
          className="pointer-events-auto absolute right-3 top-[30%] inline-flex items-center gap-1 rounded-full bg-foreground py-1.5 pl-3 pr-2 text-xs font-medium text-background shadow-lg transition-transform hover:scale-105 animate-in fade-in slide-in-from-right-2 duration-200"
        >
          {t`${laterCount} later`}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {focused && (
        <div
          ref={peekRef}
          key={focused.id}
          className="pointer-events-auto absolute overflow-y-auto rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-[0_14px_34px_rgba(30,30,25,0.16)] animate-in fade-in slide-in-from-top-1 duration-200"
          style={{
            left: peekPosition?.left ?? 0,
            top: peekPosition?.top ?? 0,
            width: peekPosition?.width ?? PEEK_WIDTH,
            maxHeight: peekPosition?.maxHeight,
            visibility: peekPosition ? 'visible' : 'hidden',
          }}
        >
          <div className="break-words text-sm font-semibold leading-snug">{focused.title}</div>
          {matchedSubtaskTitle && (
            <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
              {t`Subtask:`}{' '}
              {subtaskParts ? (
                <>{subtaskParts[0]}<mark className="task-search-hit">{subtaskParts[1]}</mark>{subtaskParts[2]}</>
              ) : matchedSubtaskTitle}
            </p>
          )}
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {[project ? formatProjectLabel(project.name, project.code) : t`No project`, people, dates].filter(Boolean).join(' · ')}
            {status && <><br />{status.name}</>}
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={openFocused}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-foreground hover:bg-muted/70"
            >
              <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
              {t`Open task`}
            </button>
            {hits.length > 1 && (
              <button
                type="button"
                onClick={focusNext}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-foreground hover:bg-muted/70"
              >
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
                {t`Next`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
