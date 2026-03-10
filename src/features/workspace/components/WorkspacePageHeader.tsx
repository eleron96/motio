import React from 'react';
import { Settings } from 'lucide-react';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { WorkspaceMobileMenu } from '@/features/workspace/components/WorkspaceMobileMenu';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { AccountBadgeButton } from '@/features/auth/components/AccountBadgeButton';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Button } from '@/shared/ui/button';

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
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  if (isMobile) {
    return (
      <header className="border-b border-border bg-card px-4 py-3">
        <WorkspaceMobileMenu
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
          primaryAction={primaryAction}
          onOpenSettings={onOpenSettings}
          onOpenAccountSettings={onOpenAccountSettings}
          settingsDisabled={settingsDisabled}
          showSettingsButton={showSettingsButton}
        />
      </header>
    );
  }

  return (
    <header className="border-b border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
          <WorkspaceNav />
        </div>

        <div className="flex items-center gap-2">
          {primaryAction}
          {showSettingsButton && (
            <Button
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
