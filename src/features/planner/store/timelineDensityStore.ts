import { create } from 'zustand';
import { readTimelineDensity, writeTimelineDensity } from '@/infrastructure/workspace/timelineDensityRepository';
import { isTimelineDensity, type TimelineDensity } from '@/features/planner/lib/timelineDensity';

// Each workspace's timeline density (server setting timeline.density). The
// last known value is kept in this browser so the timeline opens in its own
// layout instead of jumping once the answer arrives. Nothing here runs while
// the setting is off.

const STORAGE_KEY = 'motio-timeline-density.v1';

const readCache = (): Record<string, TimelineDensity> => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, TimelineDensity] => isTimelineDensity(entry[1])),
    );
  } catch {
    return {};
  }
};

const writeCache = (values: Record<string, TimelineDensity>) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Private mode or full storage: the next visit starts from the server's answer.
  }
};

type TimelineDensityState = {
  byWorkspace: Record<string, TimelineDensity>;
  loaded: Record<string, boolean>;
  load: (workspaceId: string) => Promise<void>;
  setDensity: (workspaceId: string, density: TimelineDensity) => Promise<{ error?: string }>;
};

export const useTimelineDensityStore = create<TimelineDensityState>((set, get) => ({
  byWorkspace: readCache(),
  loaded: {},
  load: async (workspaceId) => {
    if (get().loaded[workspaceId]) return;
    set((state) => ({ loaded: { ...state.loaded, [workspaceId]: true } }));
    const result = await readTimelineDensity(workspaceId);
    // No column yet or no answer: keep what this browser knew (or normal).
    if ('error' in result || !isTimelineDensity(result.density)) return;
    const density = result.density;
    if (get().byWorkspace[workspaceId] === density) return;
    const next = { ...get().byWorkspace, [workspaceId]: density };
    writeCache(next);
    set({ byWorkspace: next });
  },
  setDensity: async (workspaceId, density) => {
    const previous = get().byWorkspace;
    const next = { ...previous, [workspaceId]: density };
    set({ byWorkspace: next });
    const result = await writeTimelineDensity(workspaceId, density);
    if (result.error) {
      set({ byWorkspace: previous });
      return { error: result.error };
    }
    writeCache(next);
    return {};
  },
}));
