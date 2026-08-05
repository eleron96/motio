import React, { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
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
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/features/auth/store/authStore';
import { CreateWorkspaceDialog } from '@/features/workspace/components/CreateWorkspaceDialog';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';

interface WorkspaceSwitcherProps {
  /** Render the trigger borderless to sit inside the workspace capsule. */
  inCapsule?: boolean;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({ inCapsule = false }) => {
  const {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
  } = useAuthStore(useShallow((state) => ({
    workspaces: state.workspaces,
    currentWorkspaceId: state.currentWorkspaceId,
    setCurrentWorkspaceId: state.setCurrentWorkspaceId,
  })));

  const [createOpen, setCreateOpen] = useState(false);

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const canCreateWorkspace = workspaces.length < 5;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={inCapsule ? 'ghost' : 'outline'}
            className={cn(
              'gap-2',
              inCapsule &&
                'h-8 rounded-md px-2.5 text-foreground hover:bg-background hover:shadow-sm',
            )}
          >
            <span className="max-w-[180px] truncate">{currentWorkspace?.name ?? t`Select workspace`}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t`Workspaces`}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentWorkspaceId ?? ''}
            onValueChange={(value) => setCurrentWorkspaceId(value)}
          >
            {workspaces.map((workspace) => (
              <DropdownMenuRadioItem
                key={workspace.id}
                value={workspace.id}
                className="data-[state=checked]:bg-zinc-800 data-[state=checked]:text-white"
              >
                <span className="truncate">{workspace.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => { event.preventDefault(); setCreateOpen(true); }}
            disabled={!canCreateWorkspace}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t`Create workspace`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
};
