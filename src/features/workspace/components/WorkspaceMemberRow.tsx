import React from 'react';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { WorkspaceRole } from '@/features/auth/store/authStore';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { cn } from '@/shared/lib/classNames';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Crown, MoreHorizontal, Pencil } from 'lucide-react';
import { t } from '@lingui/macro';
import type { AuthState, WorkspaceRole as MemberRole } from '@/features/auth/store/authStore.contract';

export type WorkspaceMemberSummary = AuthState['members'][number];

type MemberGroupOption = { id: string; name: string };

interface WorkspaceMemberRowProps {
  member: WorkspaceMemberSummary;
  currentUserId: string | null;
  ownerId: string | null;
  assigneeByUserId: Map<string, { isActive: boolean; id: string }>;
  isAdmin: boolean;
  canRemoveMembers: boolean;
  groups: MemberGroupOption[];
  groupsLoading: boolean;
  leaving: boolean;
  handleRoleChange: (userId: string, nextRole: MemberRole) => void;
  handleGroupChange: (userId: string, nextGroupId: string) => void;
  handleMemberStatusChange: (assigneeId: string, nextValue: boolean) => void;
  handleLeave: () => void;
  setRemoveTarget: (member: WorkspaceMemberSummary) => void;
  openRenamePurgedDialog: (member: WorkspaceMemberSummary) => void;
}

/** One row of the workspace's member list: who, role, group, active switch, actions. */
export const WorkspaceMemberRow: React.FC<WorkspaceMemberRowProps> = ({
  member,
  currentUserId,
  ownerId,
  assigneeByUserId,
  isAdmin,
  canRemoveMembers,
  groups,
  groupsLoading,
  leaving,
  handleRoleChange,
  handleGroupChange,
  handleMemberStatusChange,
  handleLeave,
  setRemoveTarget,
  openRenamePurgedDialog,
}) => {
  const isSelf = Boolean(currentUserId && member.userId === currentUserId);
  const isOwner = Boolean(ownerId && member.userId === ownerId);
  const assignee = assigneeByUserId.get(member.userId);
  const isActive = assignee?.isActive ?? true;
  const isPurged = member.status === 'PURGED';
  const canRenamePurged = isAdmin && isPurged;

  return (
    <div key={member.userId} className="grid items-center gap-3 rounded-md border px-3 py-3 md:grid-cols-[1fr,140px,180px,120px,90px]">
      <div className="flex items-center gap-3 min-w-0">
        <PersonAvatar
          userId={member.userId}
          name={member.displayName ?? member.email}
          avatarUrl={member.avatarUrl}
          colorSeed={member.userId}
          size="md"
          className="shrink-0"
        />
        <div className="min-w-0">
        <div className={cn('text-sm font-medium truncate', isPurged && 'italic text-muted-foreground')}>
          {member.email}
          {isSelf ? ` ${t`(you)`}` : ''}
        </div>
        {member.displayName && (
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('text-xs text-muted-foreground truncate', isPurged && 'italic')}>
              {member.displayName}
            </div>
            {canRenamePurged && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => openRenamePurgedDialog(member)}
                aria-label={t`Rename deleted member`}
                data-testid={`rename-purged-button-${member.userId}`}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
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
      <Select
        value={member.role}
        onValueChange={(value) => void handleRoleChange(member.userId, value as WorkspaceRole)}
        disabled={!isAdmin}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewer">{t`Viewer`}</SelectItem>
          <SelectItem value="editor">{t`Editor`}</SelectItem>
          <SelectItem value="admin">{t`Admin`}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={member.groupId ?? 'none'}
        onValueChange={(value) => void handleGroupChange(member.userId, value)}
        disabled={!isAdmin}
      >
        <SelectTrigger className="w-[180px] max-w-[180px] [&>span]:truncate">
          <SelectValue placeholder={groupsLoading ? t`Loading groups...` : t`No group`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t`No group`}</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-3">
        {assignee ? (
          <>
            <Switch
              checked={isActive}
              onCheckedChange={(value) => void handleMemberStatusChange(assignee.id, value)}
              disabled={!isAdmin || isSelf}
              aria-label={isActive ? t`Disable member` : t`Enable member`}
            />
            <span className="text-[10px] text-muted-foreground">
              {isActive ? t`Active` : t`Disabled`}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex justify-end">
        {isSelf ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleLeave()}
            disabled={leaving}
            data-testid="leave-workspace-button"
          >
            {t`Leave`}
          </Button>
        ) : canRemoveMembers ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t`Member actions`}
                data-testid={`member-actions-${member.userId}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setRemoveTarget(member)}
              >
                {t`Remove`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
};
