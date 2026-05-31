import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { WorkspacePageHeader } from '@/features/workspace/components/WorkspacePageHeader';

/**
 * Header configuration a page contributes to the persistent workspace header.
 * Only `primaryAction` is truly page-specific; the rest mirror the old
 * per-page `WorkspacePageHeader` props.
 */
export interface WorkspaceHeaderConfig {
  primaryAction?: React.ReactNode;
  onOpenSettings?: () => void;
  onOpenAccountSettings?: () => void;
  settingsDisabled?: boolean;
  showSettingsButton?: boolean;
}

type SetHeaderConfig = (config: WorkspaceHeaderConfig | null) => void;

const HeaderConfigContext = createContext<SetHeaderConfig>(() => {});

/**
 * Register this page's header config with the persistent layout header.
 * Pass the values the header should show plus a dependency list of the inputs
 * that change them (the same things you'd put in a useMemo for `primaryAction`).
 *
 * The header lives in the layout and never unmounts on section navigation, so
 * registering here is how each routed page drives the shared header.
 */
export function useWorkspaceHeader(config: WorkspaceHeaderConfig, deps: React.DependencyList): void {
  const setConfig = useContext(HeaderConfigContext);
  useLayoutEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // The caller-supplied deps describe when `config` meaningfully changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Persistent workspace shell: renders the header once and swaps only the page
 * body via <Outlet/>. Because the header (and its nav) never remounts between
 * sections, the active-section pill can animate as it slides between tabs.
 */
export const WorkspaceLayout: React.FC = () => {
  const [config, setConfig] = useState<WorkspaceHeaderConfig | null>(null);

  return (
    <HeaderConfigContext.Provider value={setConfig}>
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        <WorkspacePageHeader
          primaryAction={config?.primaryAction}
          onOpenSettings={config?.onOpenSettings ?? (() => {})}
          onOpenAccountSettings={config?.onOpenAccountSettings ?? (() => {})}
          settingsDisabled={config?.settingsDisabled ?? false}
          showSettingsButton={config?.showSettingsButton ?? true}
        />
        <Outlet />
      </div>
    </HeaderConfigContext.Provider>
  );
};
