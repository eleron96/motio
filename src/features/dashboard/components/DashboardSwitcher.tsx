import React from 'react';
import { ChevronDown, Plus, Settings } from 'lucide-react';
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

interface DashboardSwitcherProps {
  dashboards: DashboardSummary[];
  currentDashboardId: string | null;
  currentDashboardName: string | undefined;
  onSelectDashboard: (dashboardId: string) => void;
  canEdit: boolean;
  canCreateDashboard: boolean;
  canDeleteDashboard: boolean;
  dialogs: DashboardManageDialogs;
}

/** The dashboard picker and its settings menu (rename, delete). */
export const DashboardSwitcher: React.FC<DashboardSwitcherProps> = ({
  dashboards,
  currentDashboardId,
  currentDashboardName,
  onSelectDashboard,
  canEdit,
  canCreateDashboard,
  canDeleteDashboard,
  dialogs,
}) => (
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
        <DropdownMenuItem
          onSelect={dialogs.openDeleteDialog}
          disabled={!canEdit || !canDeleteDashboard}
          className="text-destructive focus:text-destructive"
        >
          {t`Delete dashboard`}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </>
);
