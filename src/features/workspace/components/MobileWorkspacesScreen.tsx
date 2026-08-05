import React from 'react';
import { Check, Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { CreateWorkspaceDialog } from '@/features/workspace/components/CreateWorkspaceDialog';
import { MobileStackScreen } from '@/shared/ui/mobile-stack-screen';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';

const WORKSPACE_LIMIT = 5;

interface MobileWorkspacesScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Back to the menu sheet. */
  onBack: () => void;
}

/** Workspace switching on a phone: a list you tap, not a desktop dropdown. */
export const MobileWorkspacesScreen: React.FC<MobileWorkspacesScreenProps> = ({
  open,
  onOpenChange,
  onBack,
}) => {
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const setCurrentWorkspaceId = useAuthStore((state) => state.setCurrentWorkspaceId);
  const [createOpen, setCreateOpen] = React.useState(false);

  const handlePick = (workspaceId: string) => {
    if (workspaceId !== currentWorkspaceId) setCurrentWorkspaceId(workspaceId);
    onOpenChange(false);
  };

  const content = (
    <div className="flex flex-col gap-5">
      <MobileListGroup title={t`Workspaces`}>
        {workspaces.map((workspace) => (
          <MobileListRow
            key={workspace.id}
            title={workspace.name}
            value={workspace.id === currentWorkspaceId ? <Check className="h-4 w-4 text-foreground" /> : undefined}
            onClick={() => handlePick(workspace.id)}
          />
        ))}
      </MobileListGroup>

      <MobileListGroup
        note={workspaces.length >= WORKSPACE_LIMIT ? t`Workspace limit reached (5).` : undefined}
      >
        <MobileListRow
          icon={<Plus className="h-[17px] w-[17px]" />}
          title={t`Create workspace`}
          disabled={workspaces.length >= WORKSPACE_LIMIT}
          onClick={() => setCreateOpen(true)}
        />
      </MobileListGroup>
    </div>
  );

  return (
    <>
      <MobileStackScreen
        open={open}
        onOpenChange={onOpenChange}
        title={t`Workspaces`}
        onBack={onBack}
        sections={[{ id: 'all', label: t`Workspaces`, content }]}
        activeId="all"
        onActiveChange={() => {}}
      />
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
};
