import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { workspaceSyncService } from '@/application/workspace/workspaceSyncService';
import type { PlannerStore } from '@/features/planner/store/plannerStore.contract';
import { initialFilters } from '@/features/planner/store/plannerStore.helpers';
import { createWorkspaceActions } from '@/features/planner/store/plannerStore.workspaceActions';
import { createTaskActions } from '@/features/planner/store/plannerStore.taskActions';
import { createCatalogActions } from '@/features/planner/store/plannerStore.catalogActions';

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      milestones: [],
      projects: [],
      trackedProjectIds: [],
      customers: [],
      assignees: [],
      memberGroups: [],
      memberGroupAssignments: [],
      statuses: [],
      taskTypes: [],
      tags: [],
      viewMode: 'week',
      groupMode: 'assignee',
      currentDate: format(new Date(), 'yyyy-MM-dd'),
      filters: initialFilters,
      selectedTaskId: null,
      highlightedTaskId: null,
      timelineAttentionDate: null,
      workspaceId: null,
      loading: false,
      error: null,
      dataRequestId: 0,
      loadedRange: null,
      assigneeTaskCounts: {},
      assigneeCountsDate: null,
      assigneeCountsWorkspaceId: null,
      scrollRequestId: 0,
      scrollTargetDate: null,
      timelineInteractingUntil: 0,

      setWorkspaceId: (id) => set({ workspaceId: id }),

      reset: () => set({
        tasks: [],
        milestones: [],
        projects: [],
        trackedProjectIds: [],
        customers: [],
        assignees: [],
        memberGroups: [],
        memberGroupAssignments: [],
        statuses: [],
        taskTypes: [],
        tags: [],
        selectedTaskId: null,
        highlightedTaskId: null,
        timelineAttentionDate: null,
        workspaceId: null,
        loading: false,
        error: null,
        dataRequestId: 0,
        loadedRange: null,
        assigneeTaskCounts: {},
        assigneeCountsDate: null,
        assigneeCountsWorkspaceId: null,
        scrollRequestId: 0,
        scrollTargetDate: null,
        timelineInteractingUntil: 0,
      }),

      markTimelineInteraction: (durationMs = 650) => set((state) => {
        const now = Date.now();
        const nextUntil = now + Math.max(250, durationMs);
        if (nextUntil <= state.timelineInteractingUntil) return state;
        // Не засоряем store частыми апдейтами во время скролла.
        if (nextUntil - state.timelineInteractingUntil < 120) return state;
        return { timelineInteractingUntil: nextUntil };
      }),

      upsertTasks: (tasks) => set((state) => {
        if (tasks.length === 0) return state;
        const incoming = new Map(tasks.map((task) => [task.id, task]));
        const existingIds = new Set(state.tasks.map((task) => task.id));
        const nextTasks = state.tasks.map((task) => incoming.get(task.id) ?? task);

        tasks.forEach((task) => {
          if (!existingIds.has(task.id)) {
            nextTasks.push(task);
          }
        });

        const selectedTaskId = state.selectedTaskId && nextTasks.some((task) => task.id === state.selectedTaskId)
          ? state.selectedTaskId
          : null;
        const highlightedTaskId = state.highlightedTaskId && nextTasks.some((task) => task.id === state.highlightedTaskId)
          ? state.highlightedTaskId
          : null;

        return {
          tasks: nextTasks,
          selectedTaskId,
          highlightedTaskId,
        };
      }),

      removeTasksByIds: (ids) => set((state) => {
        if (ids.length === 0) return state;
        const removed = new Set(ids);
        const nextTasks = state.tasks.filter((task) => !removed.has(task.id));
        if (nextTasks.length === state.tasks.length) return state;

        return {
          tasks: nextTasks,
          selectedTaskId: state.selectedTaskId && removed.has(state.selectedTaskId)
            ? null
            : state.selectedTaskId,
          highlightedTaskId: state.highlightedTaskId && removed.has(state.highlightedTaskId)
            ? null
            : state.highlightedTaskId,
        };
      }),

      upsertMilestones: (milestones) => set((state) => {
        if (milestones.length === 0) return state;
        const incoming = new Map(milestones.map((milestone) => [milestone.id, milestone]));
        const existingIds = new Set(state.milestones.map((milestone) => milestone.id));
        const nextMilestones = state.milestones.map((milestone) => incoming.get(milestone.id) ?? milestone);

        milestones.forEach((milestone) => {
          if (!existingIds.has(milestone.id)) {
            nextMilestones.push(milestone);
          }
        });

        return { milestones: nextMilestones };
      }),

      removeMilestonesByIds: (ids) => set((state) => {
        if (ids.length === 0) return state;
        const removed = new Set(ids);
        const nextMilestones = state.milestones.filter((milestone) => !removed.has(milestone.id));
        if (nextMilestones.length === state.milestones.length) return state;
        return { milestones: nextMilestones };
      }),

      // Крупные доменные блоки вынесены в отдельные action-модули для SRP и упрощения поддержки.
      ...createWorkspaceActions(set, get),
      ...createTaskActions(set, get),
      ...createCatalogActions(set, get),

      setViewMode: (mode) => set({ viewMode: mode }),
      setGroupMode: (mode) => set({ groupMode: mode }),
      setCurrentDate: (date) => set({ currentDate: date }),
      requestScrollToDate: (date) => set((state) => ({
        scrollTargetDate: date,
        scrollRequestId: state.scrollRequestId + 1,
      })),
      setTimelineAttentionDate: (date) => set({ timelineAttentionDate: date }),
      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters },
      })),
      clearFilterCriteria: () => set((state) => ({
        filters: {
          ...state.filters,
          projectIds: [],
          assigneeIds: [],
          groupIds: [],
          statusIds: [],
          typeIds: [],
          tagIds: [],
        },
      })),
      clearFilters: () => set({ filters: initialFilters }),
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),
      setHighlightedTaskId: (id) => set({ highlightedTaskId: id }),
    }),
    {
      name: 'planner-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        groupMode: state.groupMode,
        currentDate: state.currentDate,
      }),
    },
  ),
);

workspaceSyncService.registerAdapter({
  resetWorkspaceState: () => {
    const state = usePlannerStore.getState();
    state.reset();
    state.clearFilters();
  },
  refreshAssignees: async () => {
    await usePlannerStore.getState().refreshAssignees();
  },
  refreshMemberGroups: async () => {
    await usePlannerStore.getState().refreshMemberGroups();
  },
});
