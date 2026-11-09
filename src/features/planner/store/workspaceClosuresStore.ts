import { create } from 'zustand';
import {
  createWorkspaceClosure,
  deleteWorkspaceClosure,
  listWorkspaceClosures,
  updateWorkspaceClosure,
} from '@/infrastructure/workspace/workspaceClosuresRepository';
import type { WorkspaceClosure, WorkspaceClosureInput } from '@/shared/domain/workspaceClosures';

// Days off for a whole workspace (server setting workspaces.closures). Read by
// the holiday map (useWorkspaceClosures) and edited in workspace settings.
// Nothing here runs while the setting is off.

type WorkspaceClosuresState = {
  byWorkspace: Record<string, WorkspaceClosure[]>;
  loading: Record<string, boolean>;
  load: (workspaceId: string, options?: { force?: boolean }) => Promise<void>;
  create: (workspaceId: string, input: WorkspaceClosureInput) => Promise<{ error?: string }>;
  update: (workspaceId: string, id: string, input: WorkspaceClosureInput) => Promise<{ error?: string }>;
  remove: (workspaceId: string, id: string) => Promise<{ error?: string }>;
};

const byStart = (closures: WorkspaceClosure[]) => [...closures].sort((a, b) => a.startDate.localeCompare(b.startDate));

export const useWorkspaceClosuresStore = create<WorkspaceClosuresState>((set, get) => ({
  byWorkspace: {},
  loading: {},
  load: async (workspaceId, options) => {
    const state = get();
    if (state.loading[workspaceId]) return;
    if (!options?.force && state.byWorkspace[workspaceId]) return;
    set({ loading: { ...state.loading, [workspaceId]: true } });
    const result = await listWorkspaceClosures(workspaceId);
    set((current) => ({
      loading: { ...current.loading, [workspaceId]: false },
      // A failed read (no table yet, network) shows no closures rather than breaking the calendar.
      byWorkspace: { ...current.byWorkspace, [workspaceId]: 'closures' in result ? result.closures : [] },
    }));
  },
  create: async (workspaceId, input) => {
    const result = await createWorkspaceClosure(workspaceId, input);
    if ('error' in result) return { error: result.error };
    set((current) => ({
      byWorkspace: {
        ...current.byWorkspace,
        [workspaceId]: byStart([...(current.byWorkspace[workspaceId] ?? []), result.closure]),
      },
    }));
    return {};
  },
  update: async (workspaceId, id, input) => {
    const result = await updateWorkspaceClosure(workspaceId, id, input);
    if ('error' in result) return { error: result.error };
    set((current) => ({
      byWorkspace: {
        ...current.byWorkspace,
        [workspaceId]: byStart((current.byWorkspace[workspaceId] ?? [])
          .map((closure) => (closure.id === id ? result.closure : closure))),
      },
    }));
    return {};
  },
  remove: async (workspaceId, id) => {
    const result = await deleteWorkspaceClosure(workspaceId, id);
    if (result.error) return { error: result.error };
    set((current) => ({
      byWorkspace: {
        ...current.byWorkspace,
        [workspaceId]: (current.byWorkspace[workspaceId] ?? []).filter((closure) => closure.id !== id),
      },
    }));
    return {};
  },
}));
