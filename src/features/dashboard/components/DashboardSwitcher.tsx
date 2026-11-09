import React, { useRef } from 'react';
import { ChevronDown, Copy, Download, Plus, Settings, Upload } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { DashboardSummary } from '@/features/dashboard/types/dashboard';
import type { DashboardManageDialogs } from '@/features/dashboard/hooks/useDashboardManageDialogs';
import { useDashboardTransfer } from '@/features/dashboard/hooks/useDashboardTransfer';

interface DashboardSwitcherProps {
  dashboards: DashboardSummary[];
  currentDashboardId: string | null;
  currentDashboardName: string | undefined;
  onSelectDashboard: (dashboardId: string) => void;
  canEdit: boolean;
  canCreateDashboard: boolean;
  canDeleteDashboard: boolean;
  dialogs: DashboardManageDialogs;
  workspaceId: string | null;
}

/**
 * The dashboard picker and its settings menu (rename, delete; duplicate,
 * export and import where the server allows it).
 */
export const DashboardSwitcher: React.FC<DashboardSwitcherProps> = ({
  dashboards,
  currentDashboardId,
  currentDashboardName,
  onSelectDashboard,
  canEdit,
  canCreateDashboard,
  canDeleteDashboard,
  dialogs,
  workspaceId,
}) => {
  const transfer = useDashboardTransfer(workspaceId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  return (
  <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <span className="max-w-[220px] truncate">
            {currentDashboardName ?? t`Select dashboard`}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{t`Dashboards`}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentDashboardId ?? ''}
          onValueChange={(value) => onSelectDashboard(value)}
        >
          {dashboards.map((dashboard) => (
            <DropdownMenuRadioItem
              key={dashboard.id}
              value={dashboard.id}
              className="data-[state=checked]:bg-zinc-800 data-[state=checked]:text-white"
            >
              <span className="truncate">{dashboard.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={dialogs.openCreateDialog}
          disabled={!canEdit || !canCreateDashboard}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t`New dashboard`}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title={t`Dashboard settings`}
          aria-label={t`Dashboard settings`}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onSelect={dialogs.openRenameDialog}
          disabled={!canEdit || !currentDashboardId}
        >
          {t`Rename dashboard`}
        </DropdownMenuItem>
        {transfer.enabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void transfer.duplicate()}
              disabled={!canEdit || !canCreateDashboard || !currentDashboardId}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t`Duplicate dashboard`}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={transfer.exportToFile} disabled={!currentDashboardId}>
              <Download className="mr-2 h-4 w-4" />
              {t`Export to file`}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => fileInputRef.current?.click()}
              disabled={!canEdit || !canCreateDashboard}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t`Import from file`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={dialogs.openDeleteDialog}
          disabled={!canEdit || !canDeleteDashboard}
          className="text-destructive focus:text-destructive"
        >
          {t`Delete dashboard`}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {transfer.enabled && (
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void transfer.importFromFile(file);
        }}
      />
    )}
  </>
  );
};
