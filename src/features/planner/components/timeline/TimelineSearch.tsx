import React, { useEffect, useRef } from 'react';
import { t } from '@lingui/macro';
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import {
  useTimelineTaskSearchNavigation,
  useTimelineTaskSearchRunner,
} from '@/features/planner/hooks/useTimelineTaskSearch';
import { isSearchableQuery, splitHitsByRange } from '@/shared/domain/taskSearch';

const isTypingTarget = (target: EventTarget | null) => (
  target instanceof HTMLElement
  && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
);

/**
 * The search field of the timeline toolbar: a quiet magnifier at rest that
 * opens into a pill (click, ⌘K / Ctrl+K or "/"). The timeline itself shows the
 * result — see `TimelineSearchStrip` and the `task-search-*` bar classes.
 */
export const TimelineSearch: React.FC = () => {
  useTimelineTaskSearchRunner();
  const open = useTaskSearchStore((state) => state.open);
  const query = useTaskSearchStore((state) => state.query);
  const hits = useTaskSearchStore((state) => state.hits);
  const searching = useTaskSearchStore((state) => state.searching);
  const focusedId = useTaskSearchStore((state) => state.focusedId);
  const visibleRange = useTaskSearchStore((state) => state.visibleRange);
  const openSearch = useTaskSearchStore((state) => state.openSearch);
  const closeSearch = useTaskSearchStore((state) => state.closeSearch);
  const setQuery = useTaskSearchStore((state) => state.setQuery);
  const { focusNext, focusPrevious, openFocused } = useTimelineTaskSearchNavigation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ⌘K / Ctrl+K anywhere, "/" when not typing somewhere else. Escape also ends
  // the search after a click on the timeline took focus from the field — unless
  // a dialog or menu (the task card) used that key first: Radix layers mark the
  // Escape they close on as handled.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (event.defaultPrevented || !useTaskSearchStore.getState().open || isTypingTarget(event.target)) return;
        if (usePlannerStore.getState().selectedTaskId || document.querySelector('[role="dialog"]')) return;
        closeSearch();
        return;
      }
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target);
      if (!isShortcut && !isSlash) return;
      event.preventDefault();
      openSearch();
      window.requestAnimationFrame(() => inputRef.current?.select());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSearch, openSearch]);

  // Leaving the timeline ends the search.
  useEffect(() => () => closeSearch(), [closeSearch]);

  const searchable = isSearchableQuery(query);
  const focusedIndex = hits.findIndex((hit) => hit.id === focusedId);
  const onScreen = splitHitsByRange(hits, visibleRange).inside.length;
  const counter = !searchable
    ? null
    : hits.length === 0
      ? (searching ? null : t`Nothing found`)
      : focusedIndex >= 0
        ? t`${focusedIndex + 1} of ${hits.length}`
        : t`${onScreen} of ${hits.length} on screen`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          openSearch();
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="press inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        aria-label={t`Search tasks`}
        title={t`Search tasks`}
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium tracking-wide">⌘K</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex h-9 w-[min(380px,40vw)] items-center gap-2 rounded-full border border-border bg-background pl-3 pr-1.5',
        'shadow-[0_6px_20px_rgba(30,30,25,0.08),0_1px_2px_rgba(30,30,25,0.06)] animate-in fade-in zoom-in-95 duration-200',
      )}
      role="search"
    >
      {searching
        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        : <Search className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />}
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // The task card opened from here keeps focus in this field; its
            // Escape closes the card, not the search.
            if (event.defaultPrevented || usePlannerStore.getState().selectedTaskId) return;
            event.preventDefault();
            event.stopPropagation();
            closeSearch();
          } else if (usePlannerStore.getState().selectedTaskId) {
            return;
          } else if (event.key === 'ArrowDown' || (event.key === 'Enter' && focusedIndex < 0)) {
            event.preventDefault();
            focusNext();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusPrevious();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            openFocused();
          }
        }}
        placeholder={t`Find a task`}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        aria-label={t`Search tasks`}
      />
      {counter && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">{counter}</span>
      )}
      {hits.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={focusPrevious}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            aria-label={t`Previous match`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={focusNext}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            aria-label={t`Next match`}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={closeSearch}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[10.5px] text-muted-foreground hover:text-foreground"
        aria-label={t`Close search`}
      >
        <X className="h-3 w-3" aria-hidden="true" />
        esc
      </button>
    </div>
  );
};
