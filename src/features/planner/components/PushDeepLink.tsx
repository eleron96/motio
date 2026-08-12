import React, { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { needsAssigneeGroupingToRevealTask } from '@/shared/domain/timelineTaskReveal';
import { toast } from '@/shared/ui/sonner';
import { t } from '@lingui/macro';

interface PendingDeepLink {
  workspaceId: string;
  taskId: string;
  openPanel: boolean;
}

// If the task hasn't shown up in the store by then (deleted, or access lost),
// stop waiting and tell the user instead of silently doing nothing.
const GIVE_UP_MS = 12000;

/**
 * Consumes the push-notification deep link (/app?ws=..&task=..[&panel=1]) that
 * the service worker opens on notification click, and replays the same "open
 * this notification" flow as the in-app bell: switch workspace if needed, drop
 * filters, focus the task's date on the day timeline, highlight the task, and
 * (for comment mentions) open the task detail panel.
 *
 * Renders nothing; mounted once on the planner page. Params are stripped from
 * the address bar immediately so refresh/back doesn't re-trigger the jump.
 */
export const PushDeepLink: React.FC = () => {
  const [pending, setPending] = useState<PendingDeepLink | null>(null);
  const gaveUpRef = useRef(false);

  const user = useAuthStore((state) => state.user);
  const workspaces = useAuthStore((state) => state.workspaces);
  const workspacesLoaded = useAuthStore((state) => state.workspacesLoaded);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useAuthStore((state) => state.setCurrentWorkspaceId);

  const tasks = usePlannerStore((state) => state.tasks);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const groupMode = usePlannerStore((state) => state.groupMode);
  const setGroupMode = usePlannerStore((state) => state.setGroupMode);
  const setViewMode = usePlannerStore((state) => state.setViewMode);
  const setCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const requestScrollToDate = usePlannerStore((state) => state.requestScrollToDate);
  const clearFilters = usePlannerStore((state) => state.clearFilters);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);

  // Read the params exactly once on mount, then clean the address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const workspaceId = params.get('ws');
    if (!taskId || !workspaceId) return;
    const openPanel = params.get('panel') === '1';
    window.history.replaceState(null, '', window.location.pathname);
    setPending({ workspaceId, taskId, openPanel });
  }, []);

  // Deadline for the whole jump: tasks load async after a workspace switch, so
  // "not in the store yet" is normal — but not forever.
  useEffect(() => {
    if (!pending) return;
    const handle = window.setTimeout(() => {
      gaveUpRef.current = true;
      setPending(null);
      toast(t`This task has been deleted.`);
    }, GIVE_UP_MS);
    return () => window.clearTimeout(handle);
  }, [pending]);

  useEffect(() => {
    if (!pending || !workspacesLoaded) return;

    // The push may be older than a membership change — don't switch into a
    // workspace the user can no longer open.
    if (!workspaces.some((workspace) => workspace.id === pending.workspaceId)) {
      setPending(null);
      if (!gaveUpRef.current) toast(t`This task has been deleted.`);
      return;
    }

    if (currentWorkspaceId !== pending.workspaceId) {
      // PlannerPage reloads tasks for the new workspace; this effect re-runs
      // when they arrive.
      setCurrentWorkspaceId(pending.workspaceId);
      return;
    }

    const task = tasks.find((item) => item.id === pending.taskId);
    if (!task) return; // still loading — the give-up timer covers the truly-gone case

    // Mirror the bell's open flow (InviteNotifications.handleOpenTaskNotification).
    clearFilters();
    if (user?.id) {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setHighlightedTaskId(task.id);
    if (needsAssigneeGroupingToRevealTask({ task, projects, assignees, groupMode })) {
      setGroupMode('assignee');
    }
    setViewMode('day');
    setCurrentDate(task.startDate);
    requestScrollToDate(task.startDate);
    setSelectedTaskId(pending.openPanel ? task.id : null);
    setPending(null);
  }, [
    pending,
    workspaces,
    workspacesLoaded,
    currentWorkspaceId,
    tasks,
    projects,
    assignees,
    groupMode,
    user?.id,
    clearFilters,
    requestScrollToDate,
    setCurrentDate,
    setCurrentWorkspaceId,
    setGroupMode,
    setHighlightedTaskId,
    setSelectedTaskId,
    setViewMode,
  ]);

  return null;
};
