import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Clock, Mail, Palette, Users } from 'lucide-react';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import { useWorkspaceAccess, type AccessMember } from '@/features/workspace/hooks/useWorkspaceAccess';
import { formatWorkspaceMemberActivity } from '@/shared/lib/workspaceMemberActivity';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { WorkspaceMembersMobileScreen } from '@/features/workspace/components/WorkspaceMembersMobileScreen';
import { WorkspaceMemberDetailScreen } from '@/features/workspace/components/WorkspaceMemberDetailScreen';
import { WorkspaceInvitesMobileScreen } from '@/features/workspace/components/WorkspaceInvitesMobileScreen';
import { WorkspacePeopleColors } from '@/features/workspace/components/WorkspacePeopleColors';
import { RenamePurgedDialog } from '@/features/workspace/components/RenamePurgedDialog';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { useDemoConversion } from '@/features/demo/providers/DemoConversionProvider';

type AccessScreen = 'members' | 'invites' | 'history' | 'colors' | null;

/**
 * Workspace people on a phone: a menu, then a screen per topic.
 *
 * The desktop packs all of this into one panel — four tabs, an invites card and
 * a table whose rows carry their own controls. Squeezed into a phone that
 * became a column of 200px-tall member blocks with two dropdowns each, none of
 * which could be scrolled by hand.
 */
export const WorkspaceAccessMobile: React.FC = () => {
  const access = useWorkspaceAccess();
  const isDemo = useIsDemo();
  const { open: openDemoConversion } = useDemoConversion();

  const [screen, setScreen] = useState<AccessScreen>(null);
  const [selectedMember, setSelectedMember] = useState<AccessMember | null>(null);
  const [renameTarget, setRenameTarget] = useState<AccessMember | null>(null);

  const roleLabels: Record<string, string> = {
    admin: t`Admin`,
    editor: t`Editor`,
    viewer: t`Viewer`,
  };

  // Everyone may recolour themselves; the rest is admin ground, exactly as on
  // the desktop.
  if (!access.isAdmin) {
    return <WorkspacePeopleColors />;
  }

  // The list is the source of truth: after a role or status change the member
  // object in state would otherwise still describe the old value.
  const liveMember = selectedMember
    ? (access.members.find((member) => member.userId === selectedMember.userId) ?? null)
    : null;

  const formatHistoryDate = (isoDate: string) => {
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toLocaleString();
  };

  return (
    <div className="space-y-4">
      {access.error && (
        <Alert variant="destructive">
          <AlertTitle>{t`Action failed`}</AlertTitle>
          <AlertDescription>{access.error}</AlertDescription>
        </Alert>
      )}

      <MobileListGroup>
        <MobileListRow
          icon={<Users className="h-4 w-4" />}
          title={t`Members`}
          value={String(access.activeMembers.length + access.disabledMembers.length)}
          chevron
          onClick={() => setScreen('members')}
        />
        <MobileListRow
          icon={<Mail className="h-4 w-4" />}
          title={t`Invites`}
          value={access.pendingInvites.length > 0 ? String(access.pendingInvites.length) : undefined}
          chevron
          onClick={() => setScreen('invites')}
        />
        <MobileListRow
          icon={<Clock className="h-4 w-4" />}
          title={t`Access history`}
          chevron
          onClick={() => setScreen('history')}
        />
        <MobileListRow
          icon={<Palette className="h-4 w-4" />}
          title={t`Colours`}
          chevron
          onClick={() => setScreen('colors')}
        />
      </MobileListGroup>

      <WorkspaceMembersMobileScreen
        open={screen === 'members'}
        onOpenChange={(next) => setScreen(next ? 'members' : null)}
        activeMembers={access.activeMembers}
        disabledMembers={access.disabledMembers}
        membersLoading={access.membersLoading}
        assigneeByUserId={access.assigneeByUserId}
        groupNameById={access.groupNameById}
        roleLabels={roleLabels}
        ownerId={access.ownerId}
        currentUserId={access.currentUserId}
        onOpenMember={setSelectedMember}
      />

      <WorkspaceMemberDetailScreen
        open={selectedMember !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedMember(null);
        }}
        member={liveMember}
        assignee={liveMember ? (access.assigneeByUserId.get(liveMember.userId) ?? null) : null}
        groups={access.groups}
        groupNameById={access.groupNameById}
        isAdmin={access.isAdmin}
        isSelf={Boolean(access.currentUserId && liveMember?.userId === access.currentUserId)}
        isOwner={Boolean(access.ownerId && liveMember?.userId === access.ownerId)}
        canRemove={access.isWorkspaceOwner}
        onChangeRole={(userId, role) => void access.changeRole(userId, role as WorkspaceRole)}
        onChangeGroup={(userId, groupId) => void access.changeGroup(userId, groupId)}
        onChangeStatus={(assigneeId, isActive) => void access.changeStatus(assigneeId, isActive)}
        onRemove={(userId) => void access.removeFromWorkspace(userId)}
        onLeave={() => void access.leave()}
        onRenamePurged={(member) => setRenameTarget(member)}
      />

      <WorkspaceInvitesMobileScreen
        open={screen === 'invites'}
        onOpenChange={(next) => setScreen(next ? 'invites' : null)}
        isAdmin={access.isAdmin}
        groups={access.groups}
        invites={access.pendingInvites}
        invitesLoading={access.sentInvitesLoading}
        onInvite={async (email, role, groupId) => {
          if (isDemo) {
            // Sending real invites needs a real account. Convert instead.
            openDemoConversion('invite');
            return {};
          }
          const result = await access.invite(email, role, groupId);
          return 'error' in result ? { error: result.error } : {};
        }}
        onRevoke={(token) => void access.revokeInvite(token)}
      />

      <MobileScreenShell
        open={screen === 'history'}
        onOpenChange={(next) => setScreen(next ? 'history' : null)}
        title={t`Access history`}
      >
        {access.activityLoading ? (
          <p className="text-sm text-muted-foreground">{t`Loading history...`}</p>
        ) : access.activityError ? (
          <p className="text-sm text-destructive">{access.activityError}</p>
        ) : access.activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t`No history yet.`}</p>
        ) : (
          <div className="space-y-2">
            {access.activity.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  {formatHistoryDate(entry.createdAt)}
                </div>
                <div className="mt-1 text-sm leading-relaxed">
                  {formatWorkspaceMemberActivity(entry)}
                </div>
              </div>
            ))}
          </div>
        )}
      </MobileScreenShell>

      <MobileScreenShell
        open={screen === 'colors'}
        onOpenChange={(next) => setScreen(next ? 'colors' : null)}
        title={t`Colours`}
      >
        <WorkspacePeopleColors />
      </MobileScreenShell>

      <RenamePurgedDialog
        open={renameTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRenameTarget(null);
        }}
        userId={renameTarget?.userId ?? null}
        currentDisplayName={renameTarget?.displayName ?? null}
        onSubmit={access.renamePurged}
      />
    </div>
  );
};
