import React from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { t } from '@lingui/macro';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { WorkspacePillNav } from '@/features/workspace/components/WorkspacePillNav';
import { WorkspaceMobileMenuSheet } from '@/features/workspace/components/WorkspaceMobileMenuSheet';
import { MobileWorkspacesScreen } from '@/features/workspace/components/MobileWorkspacesScreen';
import { useMobileMenu } from '@/features/workspace/components/MobileMenuContext';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { MobileNotificationsScreen } from '@/features/auth/components/MobileNotificationsScreen';
import { useInboxFeed } from '@/features/auth/hooks/useInboxFeed';
import { AccountBadgeButton } from '@/features/auth/components/AccountBadgeButton';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';
import { Button } from '@/shared/ui/button';
import { Separator } from '@/shared/ui/separator';
import { MobileFab } from '@/shared/ui/mobile-fab';

interface WorkspacePageHeaderProps {
  primaryAction?: React.ReactNode;
  onOpenSettings: () => void;
  onOpenAccountSettings: () => void;
  settingsDisabled?: boolean;
  showSettingsButton?: boolean;
}

export const WorkspacePageHeader: React.FC<WorkspacePageHeaderProps> = ({
  primaryAction,
  onOpenSettings,
  onOpenAccountSettings,
  settingsDisabled = false,
  showSettingsButton = true,
}) => {
  const isMobile = useIsMobile();
  const basePath = useAppBasePath();
  const { open: menuOpen, openMenu, closeMenu } = useMobileMenu();
  const [mobileScreen, setMobileScreen] = React.useState<'workspaces' | 'notifications' | null>(null);
  const closeScreens = React.useCallback(() => setMobileScreen(null), []);
  // Only one inbox feed may run at a time (it owns the polling loop): the bell
  // mounts it on desktop, the header here on mobile. The /demo sandbox has no
  // backend, so its feed stays disabled — same as the bell being absent there.
  const inbox = useInboxFeed({
    enabled: isMobile && basePath === '/app',
    onDismiss: closeScreens,
  });

  const backToMenu = React.useCallback(() => {
    setMobileScreen(null);
    openMenu();
  }, [openMenu]);

  if (isMobile) {
    return (
      <>
        <header className="border-b border-border bg-card">
          <WorkspacePillNav onOpenMenu={openMenu} unreadCount={inbox.totalBadgeCount} />
        </header>
        <WorkspaceMobileMenuSheet
          open={menuOpen}
          onOpenChange={(next) => (next ? openMenu() : closeMenu())}
          onOpenSettings={onOpenSettings}
          onOpenAccountSettings={onOpenAccountSettings}
          onOpenWorkspaces={() => setMobileScreen('workspaces')}
          onOpenNotifications={basePath === '/app' ? () => setMobileScreen('notifications') : undefined}
          unreadCount={inbox.totalBadgeCount}
          settingsDisabled={settingsDisabled}
          showSettingsButton={showSettingsButton}
        />
        <MobileWorkspacesScreen
          open={mobileScreen === 'workspaces'}
          onOpenChange={(next) => { if (!next) closeScreens(); }}
          onBack={backToMenu}
        />
        <MobileNotificationsScreen
          open={mobileScreen === 'notifications'}
          onOpenChange={(next) => { if (!next) closeScreens(); }}
          onBack={backToMenu}
          feed={inbox}
        />
        {primaryAction ? <MobileFab>{primaryAction}</MobileFab> : null}
      </>
    );
  }

  return (
    <header className="border-b border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={basePath}
            aria-label={t`Motio home`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <img
              src="/favicon-theme-light.png"
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
          </Link>
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-1">
            <WorkspaceSwitcher inCapsule />
            {showSettingsButton && (
              <Button
                data-tour="settings-btn"
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                className="h-8 w-8 rounded-md text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm"
                disabled={settingsDisabled}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Separator orientation="vertical" className="h-6" />
          <WorkspaceNav />
        </div>

        <div className="flex items-center gap-2">
          {primaryAction}
          {primaryAction ? <Separator orientation="vertical" className="h-6" /> : null}
          {basePath === '/app' && <InviteNotifications />}
          <AccountBadgeButton onClick={onOpenAccountSettings} />
        </div>
      </div>
    </header>
  );
};
