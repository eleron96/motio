import React from 'react';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';

interface WorkspaceCommonDialogsProps {
  showSettings: boolean;
  onShowSettingsChange: (open: boolean) => void;
  showAccountSettings: boolean;
  onShowAccountSettingsChange: (open: boolean) => void;
}

export const WorkspaceCommonDialogs: React.FC<WorkspaceCommonDialogsProps> = ({
  showSettings,
  onShowSettingsChange,
  showAccountSettings,
  onShowAccountSettingsChange,
}) => (
  <>
    <SettingsPanel open={showSettings} onOpenChange={onShowSettingsChange} />
    <AccountSettingsDialog open={showAccountSettings} onOpenChange={onShowAccountSettingsChange} />
  </>
);
