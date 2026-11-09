import React, { useState } from 'react';
import { t } from '@lingui/macro';
import type { AdminWorkspace } from '@/features/admin/store/adminStore';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import {
  useAdminWorkspaceMembers,
  type AdminWorkspaceMember,
} from '@/features/admin/hooks/useAdminWorkspaceMembers';
import { formatWorkspaceRole } from '@/features/admin/lib/format';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';

interface AdminWorkspaceMembersDialogProps {
  /** The workspace whose people to show; null keeps the dialog closed. */
  workspace: AdminWorkspace | null;
  onOpenChange: (open: boolean) => void;
  /** After a removal: the member count in the table changed. */
  onChanged: () => void;
}

const memberName = (member: AdminWorkspaceMember) => member.displayName?.trim() || member.email || member.userId;

/**
 * Admin → Workspaces → Members: who is in a workspace and with which role, for a
 * super admin who need not be a member. The role can be changed and a person
 * taken out, as in the workspace's own "Members and access"; the owner stays.
 */
export const AdminWorkspaceMembersDialog: React.FC<AdminWorkspaceMembersDialogProps> = ({
  workspace,
  onOpenChange,
  onChanged,
}) => {
  const { members, loading, error, busyUserId, setRole, remove } = useAdminWorkspaceMembers(workspace?.id ?? null);
  const [removeTarget, setRemoveTarget] = useState<AdminWorkspaceMember | null>(null);

  const handleRole = async (member: AdminWorkspaceMember, role: WorkspaceRole) => {
    if (role === member.role) return;
    const result = await setRole(member.userId, role);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const name = memberName(member);
    const label = formatWorkspaceRole(role);
    toast.success(t`${name} is now ${label}.`);
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    const result = await remove(target.userId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const name = memberName(target);
    toast.success(t`${name} is no longer in the workspace.`);
    onChanged();
  };

  const workspaceName = workspace?.name ?? '';

  return (
    <>
      <Dialog open={Boolean(workspace)} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t`Members of ${workspaceName}`}</DialogTitle>
            <DialogDescription>
              {t`Change a role or take someone out. The workspace's member history shows these changes with your name.`}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t`Loading…`}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto">
              {members.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{memberName(member)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {member.email && member.displayName && <span className="truncate">{member.email}</span>}
                      {member.isOwner && <Badge variant="secondary">{t`Owner`}</Badge>}
                      {member.viaGroup && <Badge variant="outline">{t`From a group`}</Badge>}
                    </div>
                  </div>
                  {member.isOwner ? (
                    <span className="text-sm text-muted-foreground">{t`Admin`}</span>
                  ) : (
                    <>
                      <Select
                        value={member.role}
                        disabled={busyUserId === member.userId}
                        onValueChange={(value) => void handleRole(member, value as WorkspaceRole)}
                      >
                        <SelectTrigger className="w-[130px]" aria-label={t`Role of ${memberName(member)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">{t`Viewer`}</SelectItem>
                          <SelectItem value="editor">{t`Editor`}</SelectItem>
                          <SelectItem value="admin">{t`Admin`}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyUserId === member.userId}
                        onClick={() => setRemoveTarget(member)}
                      >
                        {t`Remove`}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove from the workspace?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget ? t`${memberName(removeTarget)} loses access to ${workspaceName}. Their tasks stay.` : ''}
              {removeTarget?.viaGroup
                ? ` ${t`A Keycloak group put them in: while the group still says so, they come back at their next sign-in. Change the group instead.`}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()}>{t`Remove`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
