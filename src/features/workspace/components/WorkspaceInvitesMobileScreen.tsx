import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import type { AccessGroup, SentInvite } from '@/features/workspace/hooks/useWorkspaceAccess';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { cn } from '@/shared/lib/classNames';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

const NO_GROUP = 'none';

interface WorkspaceInvitesMobileScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  groups: AccessGroup[];
  invites: SentInvite[];
  invitesLoading: boolean;
  onInvite: (email: string, role: WorkspaceRole, groupId: string | null) => Promise<{ error?: string } | void>;
  onRevoke: (token: string) => void;
}

const statusClassName = (status: SentInvite['status']) => {
  if (status === 'accepted') return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20';
  if (status === 'declined' || status === 'canceled' || status === 'expired') {
    return 'bg-muted text-muted-foreground border-border';
  }
  return 'bg-amber-500/15 text-amber-700 border-amber-500/20';
};

/**
 * Invites, on their own screen instead of a card wedged above the member list.
 *
 * The form is a screen too: as a popover it opened right where the keyboard
 * comes up, hiding the very fields it asked to fill.
 */
export const WorkspaceInvitesMobileScreen: React.FC<WorkspaceInvitesMobileScreenProps> = ({
  open,
  onOpenChange,
  isAdmin,
  groups,
  invites,
  invitesLoading,
  onInvite,
  onRevoke,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [groupId, setGroupId] = useState<string>(NO_GROUP);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (formOpen) return;
    setEmail('');
    setRole('viewer');
    setGroupId(NO_GROUP);
    setFormError('');
  }, [formOpen]);

  const roleOptions: MobilePickerOption[] = [
    { value: 'viewer', label: t`Viewer` },
    { value: 'editor', label: t`Editor` },
    { value: 'admin', label: t`Admin` },
  ];
  const groupOptions: MobilePickerOption[] = [
    { value: NO_GROUP, label: t`No group` },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];

  const roleLabel = roleOptions.find((option) => option.value === role)?.label ?? '';
  const groupLabel = groupOptions.find((option) => option.value === groupId)?.label ?? t`No group`;

  const statusLabel = (status: SentInvite['status']) => {
    if (status === 'accepted') return t`Accepted`;
    if (status === 'declined') return t`Declined`;
    if (status === 'canceled') return t`Canceled`;
    if (status === 'expired') return t`Expired`;
    return t`Pending`;
  };

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setFormError('');
    const result = await onInvite(trimmed, role, groupId === NO_GROUP ? null : groupId);
    setSubmitting(false);
    if (result && 'error' in result && result.error) {
      setFormError(result.error);
      return;
    }
    setFormOpen(false);
  };

  return (
    <>
      <MobileScreenShell open={open} onOpenChange={onOpenChange} title={t`Invites`}>
        <div className="space-y-4">
          {isAdmin && (
            <Button className="h-12 w-full" onClick={() => setFormOpen(true)}>
              {t`Add member`}
            </Button>
          )}

          {!isAdmin && (
            <Alert>
              <AlertTitle>{t`Read-only`}</AlertTitle>
              <AlertDescription>{t`You have view access and cannot manage members.`}</AlertDescription>
            </Alert>
          )}

          <MobileListGroup
            title={t`Sent invites`}
            note={!invitesLoading && invites.length === 0 ? t`No invites sent yet.` : undefined}
          >
            {invitesLoading ? (
              <MobileListRow title={t`Loading data...`} />
            ) : (
              invites.map((invite) => (
                <MobileListRow
                  key={invite.token}
                  title={invite.email.includes('@') ? invite.email : t`Unknown`}
                  subtitle={(
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] font-medium', statusClassName(invite.status))}
                    >
                      {statusLabel(invite.status)}
                    </Badge>
                  )}
                  right={isAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => onRevoke(invite.token)}
                    >
                      {t`Revoke`}
                    </Button>
                  ) : undefined}
                />
              ))
            )}
          </MobileListGroup>
        </div>
      </MobileScreenShell>

      <MobileScreenShell open={formOpen} onOpenChange={setFormOpen} title={t`Add member`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mobile-invite-email">{t`Email`}</Label>
            <Input
              id="mobile-invite-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t`name@example.com`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              // 16px keeps iOS from zooming the page when the field takes focus.
              className="h-12 text-base"
            />
          </div>

          <MobileListGroup>
            <MobileListRow
              title={t`Role`}
              value={roleLabel}
              chevron
              onClick={() => setRolePickerOpen(true)}
            />
            <MobileListRow
              title={t`Group`}
              value={groupLabel}
              chevron
              onClick={() => setGroupPickerOpen(true)}
            />
          </MobileListGroup>

          {formError && (
            <Alert variant="destructive">
              <AlertTitle>{t`Action failed`}</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <Button
            className="h-12 w-full"
            disabled={submitting || !email.trim()}
            onClick={() => void submit()}
          >
            {t`Send invite`}
          </Button>
        </div>
      </MobileScreenShell>

      <MobilePickerScreen
        open={rolePickerOpen}
        onOpenChange={setRolePickerOpen}
        title={t`Role`}
        options={roleOptions}
        value={role}
        onValueChange={(value) => setRole(value as WorkspaceRole)}
      />

      <MobilePickerScreen
        open={groupPickerOpen}
        onOpenChange={setGroupPickerOpen}
        title={t`Group`}
        options={groupOptions}
        value={groupId}
        searchable={groups.length >= 8}
        searchPlaceholder={t`Search groups...`}
        onValueChange={setGroupId}
      />
    </>
  );
};
