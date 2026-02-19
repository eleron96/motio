import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { cn } from '@/shared/lib/classNames';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { supabase } from '@/shared/lib/supabaseClient';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { t } from '@lingui/macro';

interface WorkspaceMembersPanelProps {
  active?: boolean;
  showTitle?: boolean;
  className?: string;
}

type MemberGroup = {
  id: string;
  name: string;
};

type MemberSortKey = 'member' | 'role' | 'group' | 'status';
type MemberSortDirection = 'asc' | 'desc';

type SentInvite = {
  token: string;
  workspaceId: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';
  isPending: boolean;
  createdAt: string | null;
};

const sentInviteStatuses: ReadonlyArray<SentInvite['status']> = [
  'pending',
  'accepted',
  'declined',
  'canceled',
  'expired',
];

const isSentInviteStatus = (value: unknown): value is SentInvite['status'] => (
  typeof value === 'string' && sentInviteStatuses.includes(value as SentInvite['status'])
);

const parseInvokeErrorMessage = async (invokeError: { message: string }, response?: Response) => {
  let message = invokeError.message;
  if (!response) return message;

  try {
    const body = await response.clone().json();
    if (body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string') {
      message = (body as { error: string }).error;
    }
  } catch (_error) {
    try {
      const text = await response.clone().text();
      if (text) message = text;
    } catch (_innerError) {
      // Keep original invoke error.
    }
  }

  return message;
};

export const WorkspaceMembersPanel: React.FC<WorkspaceMembersPanelProps> = ({
  active = true,
  showTitle = true,
  className,
}) => {
  const {
    user,
    workspaces,
    members,
    membersLoading,
    fetchMembers,
    inviteMember,
    updateMemberRole,
    updateMemberGroup,
    removeMember,
    currentWorkspaceId,
    currentWorkspaceRole,
  } = useAuthStore();
  const { assignees, refreshAssignees, updateAssignee, setWorkspaceId } = usePlannerStore();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [error, setError] = useState('');
  const [inviteResult, setInviteResult] = useState<{ email: string; status: string; warning?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingToken, setCancelingToken] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [sentInvitesLoading, setSentInvitesLoading] = useState(false);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [inviteGroupId, setInviteGroupId] = useState('none');
  const [memberSortKey, setMemberSortKey] = useState<MemberSortKey>('member');
  const [memberSortDirection, setMemberSortDirection] = useState<MemberSortDirection>('asc');

  const isAdmin = currentWorkspaceRole === 'admin';
  const currentUserId = user?.id ?? null;
  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [currentWorkspaceId, workspaces],
  );
  const isWorkspaceOwner = Boolean(currentUserId && currentWorkspace?.ownerId === currentUserId);
  const canRemoveMembers = isWorkspaceOwner;

  useEffect(() => {
    if (active && currentWorkspaceId) {
      fetchMembers(currentWorkspaceId);
      setWorkspaceId(currentWorkspaceId);
      refreshAssignees();
    }
  }, [active, currentWorkspaceId, fetchMembers, refreshAssignees, setWorkspaceId]);

  useEffect(() => {
    if (!active || !currentWorkspaceId) return;
    let isMounted = true;
    setGroupsLoading(true);
    setGroupsError('');
    supabase
      .from('member_groups')
      .select('id, name')
      .eq('workspace_id', currentWorkspaceId)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setGroupsError(error.message);
          setGroupsLoading(false);
          return;
        }
        setGroups((data ?? []) as MemberGroup[]);
        setGroupsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [active, currentWorkspaceId]);

  const loadSentInvites = useCallback(async () => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setSentInvites([]);
      setSentInvitesLoading(false);
      return;
    }

    setSentInvitesLoading(true);
    const { data, error, response } = await supabase.functions.invoke('invite', {
      body: { action: 'listSent', pendingOnly: true },
    });

    if (error) {
      setError(await parseInvokeErrorMessage(error, response));
      setSentInvitesLoading(false);
      return;
    }

    const rows = Array.isArray((data as { invites?: unknown } | null)?.invites)
      ? ((data as { invites: unknown[] }).invites ?? [])
      : [];

    const parsed = rows
      .filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as Partial<SentInvite>;
        return (
          typeof candidate.token === 'string'
          && typeof candidate.workspaceId === 'string'
          && isSentInviteStatus(candidate.status)
        );
      })
      .map((row) => {
        const candidate = row as Partial<SentInvite>;
        return {
          token: candidate.token as string,
          workspaceId: candidate.workspaceId as string,
          email: typeof candidate.email === 'string' ? candidate.email : '',
          status: candidate.status as SentInvite['status'],
          isPending: typeof candidate.isPending === 'boolean' ? candidate.isPending : candidate.status === 'pending',
          createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : null,
        } satisfies SentInvite;
      })
      .filter((row) => row.workspaceId === currentWorkspaceId);

    setSentInvites(parsed);
    setSentInvitesLoading(false);
  }, [active, currentWorkspaceId, isAdmin]);

  useEffect(() => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setSentInvites([]);
      return;
    }
    void loadSentInvites();
  }, [active, currentWorkspaceId, isAdmin, loadSentInvites]);

  const assigneeByUserId = useMemo(() => {
    const map = new Map<string, typeof assignees[number]>();
    assignees.forEach((assignee) => {
      if (assignee.userId) {
        map.set(assignee.userId, assignee);
      }
    });
    return map;
  }, [assignees]);

  const groupNameById = useMemo(() => (
    new Map(groups.map((group) => [group.id, group.name]))
  ), [groups]);

  const handleMemberSortChange = (key: MemberSortKey) => {
    setMemberSortKey((currentKey) => {
      if (currentKey === key) {
        setMemberSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setMemberSortDirection('asc');
      return key;
    });
  };

  const sortedMembers = useMemo(() => {
    const direction = memberSortDirection === 'asc' ? 1 : -1;
    const list = [...members];
    const getSortValue = (member: typeof members[number]) => {
      switch (memberSortKey) {
        case 'role':
          return member.role ?? '';
        case 'group':
          return groupNameById.get(member.groupId ?? '') ?? t`No group`;
        case 'status': {
          const assignee = assigneeByUserId.get(member.userId);
          if (!assignee) return t`Unknown`;
          return assignee.isActive ? t`Active` : t`Disabled`;
        }
        case 'member':
        default:
          return member.email ?? '';
      }
    };
    list.sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);
      const compare = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
      if (compare !== 0) return compare * direction;
      return (left.email ?? '').localeCompare(right.email ?? '', undefined, { sensitivity: 'base' });
    });
    return list;
  }, [assigneeByUserId, groupNameById, memberSortDirection, memberSortKey, members]);

  const renderSortIcon = (key: MemberSortKey) => {
    if (memberSortKey !== key) {
      return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/70" />;
    }
    return memberSortDirection === 'asc'
      ? <ChevronUp className="h-3 w-3 text-foreground" />
      : <ChevronDown className="h-3 w-3 text-foreground" />;
  };

  const sentInvitesList = useMemo(
    () => [...sentInvites]
      .filter((invite) => invite.isPending)
      .sort((left, right) => {
      const leftCreatedAt = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightCreatedAt = right.createdAt ? Date.parse(right.createdAt) : 0;
      return rightCreatedAt - leftCreatedAt;
      }),
    [sentInvites],
  );

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInviteResult(null);
    if (!email.trim()) return;

    const invitedEmail = email.trim();
    setSubmitting(true);
    const result = await inviteMember(
      invitedEmail,
      role,
      inviteGroupId === 'none' ? null : inviteGroupId,
    );
    if (result.error) {
      setError(result.error);
    }
    if (!result.error) {
      setInviteResult({
        email: result.inviteEmail ?? invitedEmail,
        status: result.inviteStatus ?? 'pending',
        warning: result.warning ?? null,
      });
    }
    setSubmitting(false);
    if (!result.error) {
      setEmail('');
      setRole('viewer');
      setInviteGroupId('none');
      setInviteOpen(false);
      void loadSentInvites();
    }
  };

  const handleCancelInvite = useCallback(async (token: string) => {
    if (!isAdmin || !token) return;
    setCancelingToken(token);
    setError('');

    const { error, response } = await supabase.functions.invoke('invite', {
      body: { action: 'cancel', token },
    });

    if (error) {
      setError(await parseInvokeErrorMessage(error, response));
      setCancelingToken(null);
      return;
    }

    await loadSentInvites();
    setCancelingToken(null);
  }, [isAdmin, loadSentInvites]);

  const getInviteStatusLabel = (status: SentInvite['status']) => {
    if (status === 'accepted') return t`Accepted`;
    if (status === 'declined') return t`Declined`;
    if (status === 'canceled') return t`Canceled`;
    if (status === 'expired') return t`Expired`;
    return t`Pending`;
  };

  const getInviteStatusClassName = (status: SentInvite['status']) => {
    if (status === 'accepted') return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20';
    if (status === 'declined' || status === 'canceled' || status === 'expired') {
      return 'bg-muted text-muted-foreground border-border';
    }
    return 'bg-amber-500/15 text-amber-700 border-amber-500/20';
  };

  const handleRoleChange = async (userId: string, nextRole: WorkspaceRole) => {
    if (!isAdmin) return;
    const result = await updateMemberRole(userId, nextRole);
    if (result.error) {
      setError(result.error);
    }
  };

  const handleGroupChange = async (userId: string, nextGroupId: string) => {
    if (!isAdmin) return;
    const groupId = nextGroupId === 'none' ? null : nextGroupId;
    const result = await updateMemberGroup(userId, groupId);
    if (result.error) {
      setError(result.error);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!canRemoveMembers) {
      setError(t`Access denied`);
      return;
    }
    if (currentUserId && userId === currentUserId) {
      setError(t`You cannot remove yourself.`);
      return;
    }
    const result = await removeMember(userId);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {showTitle && (
        <div>
          <h2 className="text-base font-semibold">{t`Workspace members`}</h2>
          <p className="text-xs text-muted-foreground">
            {t`Manage invites, roles, and access.`}
          </p>
        </div>
      )}

      {!isAdmin && (
        <Alert>
          <AlertTitle>{t`Read-only`}</AlertTitle>
          <AlertDescription>{t`You have view access and cannot manage members.`}</AlertDescription>
        </Alert>
      )}

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
              <Button variant="secondary" disabled={!isAdmin}>
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

        {(error || inviteResult) && (
          <div className="space-y-2">
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

            {error && (
              <Alert variant="destructive">
                <AlertTitle>{t`Action failed`}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
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

      <div className="rounded-lg border bg-background p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">{t`Members & roles`}</div>
          <div className="text-xs text-muted-foreground">
            {t`Manage roles, groups, and status.`}
          </div>
        </div>

        <div className="hidden md:grid grid-cols-[1fr,140px,180px,120px,90px] gap-3 text-xs text-muted-foreground px-2">
          <button
            type="button"
            onClick={() => handleMemberSortChange('member')}
            className="inline-flex items-center gap-1 text-left hover:text-foreground"
          >
            <span>{t`Member`}</span>
            {renderSortIcon('member')}
          </button>
          <button
            type="button"
            onClick={() => handleMemberSortChange('role')}
            className="inline-flex items-center gap-1 text-left hover:text-foreground"
          >
            <span>{t`Role`}</span>
            {renderSortIcon('role')}
          </button>
          <button
            type="button"
            onClick={() => handleMemberSortChange('group')}
            className="inline-flex items-center gap-1 text-left hover:text-foreground"
          >
            <span>{t`Group`}</span>
            {renderSortIcon('group')}
          </button>
          <button
            type="button"
            onClick={() => handleMemberSortChange('status')}
            className="inline-flex items-center gap-1 text-left hover:text-foreground"
          >
            <span>{t`Status`}</span>
            {renderSortIcon('status')}
          </button>
          <span className="text-right">{t`Actions`}</span>
        </div>

        {membersLoading && (
          <div className="text-sm text-muted-foreground">{t`Loading members...`}</div>
        )}
        {!membersLoading && members.length === 0 && (
          <div className="text-sm text-muted-foreground">{t`No members found.`}</div>
        )}
        {sortedMembers.map((member) => {
          const isSelf = Boolean(currentUserId && member.userId === currentUserId);
          const assignee = assigneeByUserId.get(member.userId);
          const isActive = assignee?.isActive ?? true;
          return (
            <div key={member.userId} className="grid items-center gap-3 rounded-md border px-3 py-3 md:grid-cols-[1fr,140px,180px,120px,90px]">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {member.email}
                  {isSelf ? ` ${t`(you)`}` : ''}
                </div>
                {member.displayName && (
                  <div className="text-xs text-muted-foreground truncate">{member.displayName}</div>
                )}
                {!isActive && (
                  <Badge variant="secondary" className="mt-1 text-[10px]">{t`Disabled`}</Badge>
                )}
              </div>
              <Select
                value={member.role}
                onValueChange={(value) => handleRoleChange(member.userId, value as WorkspaceRole)}
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
                onValueChange={(value) => handleGroupChange(member.userId, value)}
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
                      onCheckedChange={(value) => updateAssignee(assignee.id, { isActive: value })}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(member.userId)}
                  disabled={!canRemoveMembers || isSelf}
                >
                  {t`Remove`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
