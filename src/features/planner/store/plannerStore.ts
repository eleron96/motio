import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { workspaceSyncService } from '@/application/workspace/workspaceSyncService';
import type { PlannerStore } from '@/features/planner/store/plannerStore.contract';
import { initialFilters } from '@/features/planner/store/plannerStore.helpers';
import { createWorkspaceActions } from '@/features/planner/store/plannerStore.workspaceActions';
import { createTaskActions } from '@/features/planner/store/plannerStore.taskActions';
import { createCatalogActions } from '@/features/planner/store/plannerStore.catalogActions';
import { createTimeOffActions } from '@/features/planner/store/plannerStore.timeOffActions';
import { createUndoActions } from '@/features/planner/store/plannerStore.undoActions';
import { fetchTaskCommentCounts } from '@/infrastructure/tasks/taskCommentsRepository';
import { applyTaskCommentCountDelta } from '@/shared/domain/taskCommentCount';

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      milestones: [],
      timeOff: [],
      timeOffDragPreview: null,
      projects: [],
      trackedProjectIds: [],
      customers: [],
      customerContacts: [],
      assignees: [],
      projectMembers: [],
      projectActivity: [],
      memberGroups: [],
      memberGroupAssignments: [],
      statuses: [],
      taskTypes: [],
      tags: [],
      viewMode: 'day',
      groupMode: 'assignee',
      currentDate: format(new Date(), 'yyyy-MM-dd'),
      filters: initialFilters,
      selectedTaskId: null,
      highlightedTaskId: null,
      highlightedTaskRowAssigneeId: null,
      timelineAttentionDate: null,
      workspaceId: null,
      loading: false,
      error: null,
      dataRequestId: 0,
      loadedRange: null,
      assigneeTaskCounts: {},
      taskCommentCounts: {},
      assigneeCountsDate: null,
      assigneeCountsWorkspaceId: null,
      scrollRequestId: 0,
      scrollTargetDate: null,
      visibleCenterDate: null,
      timelineInteractingUntil: 0,
      syncHealthy: true,
      taskUndoStack: [],
      pendingDeleteTaskIds: [],
      pendingRevealTaskId: null,
      hasSampleData: false,

      setWorkspaceId: (id) => set({ workspaceId: id }),
      setPendingRevealTaskId: (taskId) => set({ pendingRevealTaskId: taskId }),
      setSyncHealthy: (healthy) => set({ syncHealthy: healthy }),

      reset: () => set({
        tasks: [],
        milestones: [],
        timeOff: [],
        timeOffDragPreview: null,
        projects: [],
        trackedProjectIds: [],
        customers: [],
        customerContacts: [],
        assignees: [],
        projectMembers: [],
        projectActivity: [],
        memberGroups: [],
        memberGroupAssignments: [],
        statuses: [],
        taskTypes: [],
        tags: [],
        selectedTaskId: null,
        highlightedTaskId: null,
        highlightedTaskRowAssigneeId: null,
        timelineAttentionDate: null,
        workspaceId: null,
        loading: false,
        error: null,
        dataRequestId: 0,
        loadedRange: null,
        assigneeTaskCounts: {},
        taskCommentCounts: {},
        assigneeCountsDate: null,
        assigneeCountsWorkspaceId: null,
        scrollRequestId: 0,
        scrollTargetDate: null,
        timelineInteractingUntil: 0,
        syncHealthy: true,
        taskUndoStack: [],
        pendingDeleteTaskIds: [],
        pendingRevealTaskId: null,
        hasSampleData: false,
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
        // Задачи в окне отложенного удаления скрыты только локально и ещё
        // живут в БД: любой CDC-флаш или reconcile может их «воскресить».
        // Пока id числится в pendingDeleteTaskIds — входящие апдейты по нему
        // отбрасываются; отмена удаления сначала снимает id из списка.
        const blockedIds = new Set(state.pendingDeleteTaskIds);
        const acceptedTasks = blockedIds.size > 0
          ? tasks.filter((task) => !blockedIds.has(task.id))
          : tasks;
        if (acceptedTasks.length === 0) return state;
        const incoming = new Map(acceptedTasks.map((task) => [task.id, task]));
        const existingIds = new Set(state.tasks.map((task) => task.id));
        const nextTasks = state.tasks.map((task) => incoming.get(task.id) ?? task);

        acceptedTasks.forEach((task) => {
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
        const highlightedTaskRowAssigneeId = highlightedTaskId
          ? state.highlightedTaskRowAssigneeId
          : null;

        return {
          tasks: nextTasks,
          selectedTaskId,
          highlightedTaskId,
          highlightedTaskRowAssigneeId,
        };
      }),

      removeTasksByIds: (ids) => set((state) => {
        if (ids.length === 0) return state;
        const removed = new Set(ids);
        const nextTasks = state.tasks.filter((task) => !removed.has(task.id));
        if (nextTasks.length === state.tasks.length) return state;
        const nextTaskCommentCounts = Object.fromEntries(
          Object.entries(state.taskCommentCounts).filter(([taskId]) => !removed.has(taskId)),
        );

        return {
          tasks: nextTasks,
          taskCommentCounts: nextTaskCommentCounts,
          selectedTaskId: state.selectedTaskId && removed.has(state.selectedTaskId)
            ? null
            : state.selectedTaskId,
          highlightedTaskId: state.highlightedTaskId && removed.has(state.highlightedTaskId)
            ? null
            : state.highlightedTaskId,
          highlightedTaskRowAssigneeId: state.highlightedTaskId && removed.has(state.highlightedTaskId)
            ? null
            : state.highlightedTaskRowAssigneeId,
        };
      }),

      upsertTaskCommentCounts: (counts) => set((state) => ({
        taskCommentCounts: {
          ...state.taskCommentCounts,
          ...counts,
        },
      })),

      adjustTaskCommentCount: (taskId, delta) => set((state) => ({
        taskCommentCounts: applyTaskCommentCountDelta(state.taskCommentCounts, taskId, delta),
      })),

      refreshTaskCommentCounts: async (workspaceId, taskIds) => {
        const result = await fetchTaskCommentCounts(workspaceId, taskIds);
        if ('error' in result) {
          console.error(result.error);
          return { error: result.error };
        }
        const activeWorkspaceId = get().workspaceId;
        if (activeWorkspaceId && activeWorkspaceId !== workspaceId) {
          return {};
        }
        get().upsertTaskCommentCounts(result.data);
        return {};
      },

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
      ...createTimeOffActions(set, get),
      ...createUndoActions(set, get),

      setViewMode: (mode) => set({ viewMode: mode }),
      setGroupMode: (mode) => set({ groupMode: mode }),
      setCurrentDate: (date) => set({ currentDate: date }),
      setVisibleCenterDate: (date) => set({ visibleCenterDate: date }),
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
      setHighlightedTaskId: (id) => set({
        highlightedTaskId: id,
        highlightedTaskRowAssigneeId: null,
      }),
      setHighlightedTaskTarget: (taskId, rowAssigneeId = null) => set({
        highlightedTaskId: taskId,
        highlightedTaskRowAssigneeId: taskId ? rowAssigneeId ?? null : null,
      }),
    }),
    {
      name: 'planner-storage',
      // 'week' is an optional view, gated by the per-user "week_view_enabled"
      // preference. PlannerPage resets viewMode to 'day' once the profile loads
      // if the user lands on 'week' without the preference enabled, so we no
      // longer coerce the persisted value here.
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
