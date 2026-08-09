import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Crown } from 'lucide-react';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import type { Assignee } from '@/features/planner/types/planner';
import type { AccessGroup, AccessMember } from '@/features/workspace/hooks/useWorkspaceAccess';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';
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

const NO_GROUP = 'none';

interface WorkspaceMemberDetailScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: AccessMember | null;
  assignee: Assignee | null;
  groups: AccessGroup[];
  groupNameById: Map<string, string>;
  isAdmin: boolean;
  isSelf: boolean;
  isOwner: boolean;
  /** Only the workspace owner may take somebody else out. */
  canRemove: boolean;
  onChangeRole: (userId: string, role: WorkspaceRole) => void;
  onChangeGroup: (userId: string, groupId: string | null) => void;
  onChangeStatus: (assigneeId: string, isActive: boolean) => void;
  onRemove: (userId: string) => void;
  onLeave: () => void;
  onRenamePurged: (member: AccessMember) => void;
}

/**
 * One person, and everything that can be done to their access.
 *
 * On a phone the desktop row — two selects, a switch and a menu, stacked — ran
 * past 200px per member and neither select could be scrolled with a finger.
 * Here the row in the list stays a name, and this screen is where the changes
 * happen: each control is a full-width row, and the choices open as screens.
 */
export const WorkspaceMemberDetailScreen: React.FC<WorkspaceMemberDetailScreenProps> = ({
  open,
  onOpenChange,
  member,
  assignee,
  groups,
  groupNameById,
  isAdmin,
  isSelf,
  isOwner,
  canRemove,
  onChangeRole,
  onChangeGroup,
  onChangeStatus,
  onRemove,
  onLeave,
  onRenamePurged,
}) => {
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const roleOptions: MobilePickerOption[] = [
    { value: 'viewer', label: t`Viewer` },
    { value: 'editor', label: t`Editor` },
    { value: 'admin', label: t`Admin` },
  ];
  const roleLabel = roleOptions.find((option) => option.value === member?.role)?.label ?? '';

  const groupOptions: MobilePickerOption[] = [
    { value: NO_GROUP, label: t`No group` },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];
  const groupLabel = member?.groupId
    ? (groupNameById.get(member.groupId) ?? t`No group`)
    : t`No group`;

  const isPurged = member?.status === 'PURGED';
  const isActive = assignee?.isActive ?? true;
  const displayName = member?.displayName || member?.email || '';

  return (
    <>
      <MobileScreenShell
        open={open}
        onOpenChange={onOpenChange}
        title={displayName}
      >
        {!member ? (
          <p className="text-sm text-muted-foreground">{t`Member not found.`}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4">
              <PersonAvatar
                userId={member.userId}
                name={member.displayName ?? member.email}
                avatarUrl={member.avatarUrl}
                colorSeed={member.userId}
                size="2xl"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {isOwner && (
                    <Badge className="flex items-center gap-1 text-[10px]">
                      <Crown className="h-3 w-3" />
                      {t`Owner`}
                    </Badge>
                  )}
                  {isPurged && (
                    <Badge variant="outline" className="text-[10px]">{t`Deleted account`}</Badge>
                  )}
                  {!isActive && !isPurged && (
                    <Badge variant="secondary" className="text-[10px]">{t`Disabled`}</Badge>
                  )}
                </div>
              </div>
            </div>

            <MobileListGroup title={t`Access`}>
              <MobileListRow
                title={t`Role`}
                value={roleLabel}
                chevron={isAdmin}
                disabled={!isAdmin}
                onClick={isAdmin ? () => setRolePickerOpen(true) : undefined}
              />
              <MobileListRow
                title={t`Group`}
                value={groupLabel}
                chevron={isAdmin}
                disabled={!isAdmin}
                onClick={isAdmin ? () => setGroupPickerOpen(true) : undefined}
              />
              <MobileListRow
                title={t`Active`}
                subtitle={isActive ? undefined : t`They keep their tasks and history but cannot open the workspace.`}
                subtitleLines={2}
                right={assignee ? (
                  <Switch
                    size="touch"
                    checked={isActive}
                    onCheckedChange={(value) => onChangeStatus(assignee.id, value)}
                    disabled={!isAdmin || isSelf}
                    aria-label={isActive ? t`Disable member` : t`Enable member`}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              />
            </MobileListGroup>

            {isAdmin && isPurged && (
              <MobileListGroup>
                <MobileListRow
                  title={t`Rename deleted member`}
                  chevron
                  onClick={() => onRenamePurged(member)}
                />
              </MobileListGroup>
            )}

            {isSelf ? (
              <Button
                variant="outline"
                className="h-12 w-full text-destructive"
                onClick={() => setLeaveOpen(true)}
                data-testid="leave-workspace-button"
              >
                {t`Leave workspace`}
              </Button>
            ) : canRemove ? (
              <Button
                variant="outline"
                className="h-12 w-full text-destructive"
                onClick={() => setRemoveOpen(true)}
                data-testid={`remove-member-${member.userId}`}
              >
                {t`Remove from workspace`}
              </Button>
            ) : null}
          </div>
        )}
      </MobileScreenShell>

      <MobilePickerScreen
        open={rolePickerOpen}
        onOpenChange={setRolePickerOpen}
        title={t`Role`}
        options={roleOptions}
        value={member?.role ?? 'viewer'}
        onValueChange={(value) => {
          if (member) onChangeRole(member.userId, value as WorkspaceRole);
        }}
      />

      <MobilePickerScreen
        open={groupPickerOpen}
        onOpenChange={setGroupPickerOpen}
        title={t`Group`}
        options={groupOptions}
        value={member?.groupId ?? NO_GROUP}
        searchable={groups.length >= 8}
        searchPlaceholder={t`Search groups...`}
        onValueChange={(value) => {
          if (member) onChangeGroup(member.userId, value === NO_GROUP ? null : value);
        }}
      />

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove member?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`They will lose access to this workspace. Tasks already assigned to them are not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-sm font-medium">{displayName}</div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                setRemoveOpen(false);
                onOpenChange(false);
                if (member) onRemove(member.userId);
              }}
            >
              {t`Remove`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Leave workspace?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You will lose access to this workspace. Your tasks stay and reattach to you if you are invited back.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                setLeaveOpen(false);
                onOpenChange(false);
                onLeave();
              }}
            >
              {t`Leave`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
