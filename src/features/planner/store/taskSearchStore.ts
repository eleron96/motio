import { create } from 'zustand';
import type { Task } from '@/features/planner/types/planner';
import type { TaskSearchDateRange } from '@/shared/domain/taskSearch';

/**
 * State of the timeline "lens" search, shared by the field in the toolbar, the
 * strip of matches, the task bars (fade / underline) and the peek card. Not
 * persisted: a reload or leaving the timeline ends the search.
 */
interface TaskSearchState {
  open: boolean;
  query: string;
  /** Matches over all dates, one per repeat series, by date. */
  hits: Task[];
  /** Ids of the hits the current filters hide (shown hollow on the strip). */
  hiddenHitIds: ReadonlySet<string>;
  searching: boolean;
  focusedId: string | null;
  /** Days currently on screen, reported by the timeline grid. */
  visibleRange: TaskSearchDateRange | null;
  /**
   * Days the grid has rendered (screen plus the scrollable margin): a match in
   * here is reached by scrolling alone, without moving the timeline's date.
   */
  renderedRange: TaskSearchDateRange | null;
  /** Width of the grid's people/projects column, px. */
  sidebarWidth: number;
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  setResults: (hits: Task[], hiddenHitIds: ReadonlySet<string>) => void;
  setSearching: (searching: boolean) => void;
  setFocusedId: (id: string | null) => void;
  setViewport: (range: TaskSearchDateRange | null, renderedRange: TaskSearchDateRange | null, sidebarWidth: number) => void;
}

const NO_IDS: ReadonlySet<string> = new Set();

export const useTaskSearchStore = create<TaskSearchState>((set) => ({
  open: false,
  query: '',
  hits: [],
  hiddenHitIds: NO_IDS,
  searching: false,
  focusedId: null,
  visibleRange: null,
  renderedRange: null,
  sidebarWidth: 0,
  openSearch: () => set({ open: true }),
  closeSearch: () => set({
    open: false,
    query: '',
    hits: [],
    hiddenHitIds: NO_IDS,
    searching: false,
    focusedId: null,
  }),
  setQuery: (query) => set({ query }),
  setResults: (hits, hiddenHitIds) => set((state) => ({
    hits,
    hiddenHitIds,
    focusedId: state.focusedId && hits.some((hit) => hit.id === state.focusedId) ? state.focusedId : null,
  })),
  setSearching: (searching) => set({ searching }),
  setFocusedId: (focusedId) => set({ focusedId }),
  setViewport: (range, renderedRange, sidebarWidth) => set((state) => (
    state.visibleRange?.start === range?.start
      && state.visibleRange?.end === range?.end
      && state.renderedRange?.start === renderedRange?.start
      && state.renderedRange?.end === renderedRange?.end
      && state.sidebarWidth === sidebarWidth
      ? state
      : { visibleRange: range, renderedRange, sidebarWidth }
  )),
}));

/** The query the bars should react to: empty while search is closed. */
export const selectActiveSearchQuery = (state: TaskSearchState) => (state.open ? state.query : '');
