import { useCallback } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import type { DashboardState } from '@/features/dashboard/store/dashboardStore.contract';
import {
  adaptDashboardFile,
  buildDashboardFile,
  dashboardFileName,
  parseDashboardFile,
  type DashboardFileProblem,
} from '@/features/dashboard/lib/dashboardTransfer';
import { useInstanceSetting } from '@/shared/store/instanceSettingsStore';
import { toast } from '@/shared/ui/sonner';

type TransferSource = Pick<
  DashboardState,
  'dashboards' | 'currentDashboardId' | 'widgets' | 'layouts' | 'statuses' | 'projects' | 'assignees' | 'groups'
> & { createDashboardFrom: DashboardState['createDashboardFrom'] | null };

const NO_SOURCE: TransferSource = {
  dashboards: [],
  currentDashboardId: null,
  widgets: [],
  layouts: {},
  statuses: [],
  projects: [],
  assignees: [],
  groups: [],
  createDashboardFrom: null,
};

const problemText = (problem: DashboardFileProblem) => {
  switch (problem) {
    case 'not_json': return t`This file is not a dashboard: it could not be read.`;
    case 'not_dashboard': return t`This file is not a Motio dashboard.`;
    case 'newer_version': return t`This dashboard comes from a newer Motio. Update this server first.`;
  }
};

/**
 * Dashboard settings → Duplicate / Export to file / Import from file, where the
 * server allows it (Admin → Settings → Copy, export and import dashboards).
 * The copy and the export take the dashboard as it is on screen.
 */
export const useDashboardTransfer = (workspaceId: string | null) => {
  const enabled = useInstanceSetting('dashboards.transfer');
  // Off: the selector hands back one constant, so the menu does not follow the
  // dashboard's every change — the switcher works exactly as before.
  const {
    dashboards, currentDashboardId, widgets, layouts, statuses, projects, assignees, groups, createDashboardFrom,
  } = useDashboardStore(useShallow((state): TransferSource => (enabled
    ? {
      dashboards: state.dashboards,
      currentDashboardId: state.currentDashboardId,
      widgets: state.widgets,
      layouts: state.layouts,
      statuses: state.statuses,
      projects: state.projects,
      assignees: state.assignees,
      groups: state.groups,
      createDashboardFrom: state.createDashboardFrom,
    }
    : NO_SOURCE)));

  const currentName = dashboards.find((dashboard) => dashboard.id === currentDashboardId)?.name ?? 'Dashboard';

  const duplicate = useCallback(async () => {
    if (!workspaceId || !createDashboardFrom) return;
    const result = await createDashboardFrom(workspaceId, { name: currentName, widgets, layouts });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const name = result.name ?? currentName;
    toast.success(t`Copied as ${name}.`);
  }, [workspaceId, createDashboardFrom, currentName, widgets, layouts]);

  const exportToFile = useCallback(() => {
    const file = buildDashboardFile(
      { name: currentName, widgets, layouts },
      { statuses, projects, assignees, groups },
      new Date().toISOString(),
    );
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = dashboardFileName(currentName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [currentName, widgets, layouts, statuses, projects, assignees, groups]);

  const importFromFile = useCallback(async (file: File) => {
    if (!workspaceId || !createDashboardFrom) return;
    const parsed = parseDashboardFile(await file.text());
    if ('problem' in parsed) {
      toast.error(problemText(parsed.problem));
      return;
    }
    const adapted = adaptDashboardFile(parsed.file, { statuses, projects, assignees, groups });
    const result = await createDashboardFrom(workspaceId, {
      name: parsed.file.name,
      widgets: adapted.widgets,
      layouts: adapted.layouts,
    });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const name = result.name ?? parsed.file.name;
    if (adapted.unmatched > 0) {
      const count = adapted.unmatched;
      toast.info(t`Imported as ${name}. ${count} filter values have no match in this workspace and were left out.`);
    } else {
      toast.success(t`Imported as ${name}.`);
    }
  }, [workspaceId, statuses, projects, assignees, groups, createDashboardFrom]);

  return { enabled, duplicate, exportToFile, importFromFile };
};
