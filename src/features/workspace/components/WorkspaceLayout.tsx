import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { WorkspacePageHeader } from '@/features/workspace/components/WorkspacePageHeader';
import { MobileMenuProvider } from '@/features/workspace/components/MobileMenuContext';
import { PendingDeletionBanner } from '@/shared/components/PendingDeletionBanner';

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
  // The mobile menu sheet is opened from the header but its screens are mounted
  // by the pages (settings dialogs), so the state lives here — above both.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMenu = useCallback(() => setMobileMenuOpen(false), []);
  const mobileMenu = useMemo(
    () => ({ open: mobileMenuOpen, openMenu, closeMenu }),
    [mobileMenuOpen, openMenu, closeMenu],
  );

  return (
    <HeaderConfigContext.Provider value={setConfig}>
      <MobileMenuProvider value={mobileMenu}>
        <div className="flex flex-col h-screen overflow-hidden bg-background">
          <PendingDeletionBanner />
          <WorkspacePageHeader
            primaryAction={config?.primaryAction}
            onOpenSettings={config?.onOpenSettings ?? (() => {})}
            onOpenAccountSettings={config?.onOpenAccountSettings ?? (() => {})}
            settingsDisabled={config?.settingsDisabled ?? false}
            showSettingsButton={config?.showSettingsButton ?? true}
          />
          <Outlet />
        </div>
      </MobileMenuProvider>
    </HeaderConfigContext.Provider>
  );
};
