import React from 'react';
import { Settings } from 'lucide-react';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { AccountBadgeButton } from '@/features/auth/components/AccountBadgeButton';
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
}) => (
  <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
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
  </header>
);
