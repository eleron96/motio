import React from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { WorkspaceRole } from '@/features/auth/store/authStore';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/classNames';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { t } from '@lingui/macro';
import type { WorkspaceInvites } from '@/features/workspace/hooks/useWorkspaceInvites';

interface WorkspaceInviteSectionProps {
  invites: WorkspaceInvites;
  isAdmin: boolean;
  groups: Array<{ id: string; name: string }>;
  groupsLoading: boolean;
  groupsError: string;
}

/** The invite card: the invite form and the invites still waiting for an answer. */
export const WorkspaceInviteSection: React.FC<WorkspaceInviteSectionProps> = ({
  invites,
  isAdmin,
  groups,
  groupsLoading,
  groupsError,
}) => {
  const {
    email,
    setEmail,
    role,
    setRole,
    inviteResult,
    submitting,
    cancelingToken,
    inviteOpen,
    setInviteOpen,
    sentInvitesList,
    sentInvitesLoading,
    inviteGroupId,
    setInviteGroupId,
    handleInvite,
    handleCancelInvite,
    getInviteStatusLabel,
    getInviteStatusClassName,
  } = invites;

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{t`Invites`}</div>
          <div className="text-xs text-muted-foreground">
            {t`Invite people and share access.`}
          </div>
        </div>
        <Popover open={inviteOpen} onOpenChange={setInviteOpen}>
          <PopoverTrigger asChild>
            <Button data-tour="members-add-member" variant="secondary" disabled={!isAdmin}>
              {t`Add member`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <form onSubmit={handleInvite} className="space-y-3">
              <Label htmlFor="invite-email">{t`Email`}</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder={t`name@example.com`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!isAdmin}
              />
              <div className="space-y-1">
                <Label>{t`Role`}</Label>
                <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)} disabled={!isAdmin}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t`Viewer`}</SelectItem>
                    <SelectItem value="editor">{t`Editor`}</SelectItem>
                    <SelectItem value="admin">{t`Admin`}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t`Group`}</Label>
                <Select
                  value={inviteGroupId}
                  onValueChange={setInviteGroupId}
                  disabled={!isAdmin}
                >
                  <SelectTrigger className="w-[220px] max-w-[220px] [&>span]:truncate">
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
                {groupsError && (
                  <div className="text-xs text-destructive">{groupsError}</div>
                )}
                {!groupsError && groups.length === 0 && (
                  <div className="text-xs text-muted-foreground">{t`No groups created yet.`}</div>
                )}
              </div>
              <Button type="submit" disabled={!isAdmin || submitting || !email.trim()}>
                {t`Send invite`}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      {inviteResult && (
        <Alert>
          <AlertTitle>{t`Invite created`}</AlertTitle>
          <AlertDescription>
            <div>{t`Check your inbox`}</div>
            <div className="mt-1 text-xs">
              {inviteResult.email} - {inviteResult.status}
            </div>
            {inviteResult.warning && (
              <div className="mt-2 text-xs text-muted-foreground">
                {inviteResult.warning}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isAdmin && (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground">{t`Sent invites`}</div>
          {sentInvitesLoading ? (
            <div className="text-xs text-muted-foreground">{t`Loading data...`}</div>
          ) : sentInvitesList.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t`No invites sent yet.`}</div>
          ) : (
            <div className="space-y-2">
              {sentInvitesList.map((invite) => {
                const displayEmail = invite.email.includes('@') ? invite.email : t`Unknown`;
                return (
                <div key={invite.token} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium" title={displayEmail}>{displayEmail}</div>
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] font-medium', getInviteStatusClassName(invite.status))}
                      >
                        {getInviteStatusLabel(invite.status)}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={cancelingToken === invite.token}
                    onClick={() => void handleCancelInvite(invite.token)}
                  >
                    {t`Revoke`}
                  </Button>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
