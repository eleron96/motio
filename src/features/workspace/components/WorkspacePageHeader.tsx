import React from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { t } from '@lingui/macro';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { WorkspacePillNav } from '@/features/workspace/components/WorkspacePillNav';
import { WorkspaceMobileDrawer } from '@/features/workspace/components/WorkspaceMobileDrawer';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { AccountBadgeButton } from '@/features/auth/components/AccountBadgeButton';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Button } from '@/shared/ui/button';
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
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  if (isMobile) {
    return (
      <>
        <header className="border-b border-border bg-card">
          <WorkspacePillNav onOpenDrawer={() => setDrawerOpen(true)} />
        </header>
        <WorkspaceMobileDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onOpenSettings={onOpenSettings}
          onOpenAccountSettings={onOpenAccountSettings}
          settingsDisabled={settingsDisabled}
          showSettingsButton={showSettingsButton}
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
            to="/app"
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
          <WorkspaceSwitcher />
          <WorkspaceNav />
        </div>

        <div className="flex items-center gap-2">
          {primaryAction}
          {showSettingsButton && (
            <Button
              data-tour="settings-btn"
              variant="outline"
              size="icon"
              onClick={onOpenSettings}
              className="h-9 w-9"
              disabled={settingsDisabled}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <InviteNotifications />
          <AccountBadgeButton onClick={onOpenAccountSettings} />
        </div>
      </div>
    </header>
  );
};
