import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Copy, RefreshCw } from 'lucide-react';
import { useAdminInvitations, type AdminInvitation } from '@/features/admin/hooks/useAdminInvitations';
import { formatDateCompact, formatWorkspaceRole } from '@/features/admin/lib/format';
import { useCopyInviteLink } from '@/features/workspace/hooks/useCopyInviteLink';
import { useLocaleStore } from '@/shared/store/localeStore';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
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
import { Input } from '@/shared/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { toast } from '@/shared/ui/sonner';

/**
 * Admin console → Invitations: every invitation nobody has answered, in every
 * workspace. Copy the link (an install without email) or revoke it. Expired
 * ones can no longer be accepted; revoking them only tidies up.
 */
const AdminInvitationsPage: React.FC = () => {
  const { invitations, truncated, loading, error, busyId, refresh, revoke } = useAdminInvitations();
  const copyLink = useCopyInviteLink();
  const locale = useLocaleStore((state) => state.locale);
  const [search, setSearch] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<AdminInvitation | null>(null);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invitations;
    return invitations.filter((invitation) => (
      invitation.email.toLowerCase().includes(query)
      || (invitation.workspaceName ?? '').toLowerCase().includes(query)
    ));
  }, [invitations, search]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    const result = await revoke(target.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const email = target.email;
    toast.success(t`The invitation for ${email} is revoked.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t`Invitations nobody has answered yet, in every workspace. Only the invited address can accept one, so copying the link is safe; an expired one can no longer be accepted.`}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t`Refresh`}
        </Button>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t`Search by email or workspace…`}
        className="max-w-sm"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t`Could not load the invitations`}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && !loading && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">{t`No open invitations.`}</p>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t`Email`}</TableHead>
                <TableHead>{t`Workspace`}</TableHead>
                <TableHead>{t`Role`}</TableHead>
                <TableHead>{t`Invited by`}</TableHead>
                <TableHead>{t`Valid until`}</TableHead>
                <TableHead className="text-right">{t`Actions`}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="text-sm">{invitation.email}</TableCell>
                  <TableCell className="text-sm">{invitation.workspaceName ?? '—'}</TableCell>
                  <TableCell className="text-sm">{formatWorkspaceRole(invitation.role)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invitation.invitedByName ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {invitation.expired
                      ? <Badge variant="outline">{t`Expired`}</Badge>
                      : formatDateCompact(invitation.expiresAt, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!invitation.expired && (
                        <Button type="button" size="sm" variant="outline" onClick={() => void copyLink(invitation.token)}>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          {t`Copy link`}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === invitation.id}
                        onClick={() => setRevokeTarget(invitation)}
                      >
                        {t`Revoke`}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {truncated && (
        <p className="text-xs text-muted-foreground">{t`Showing the newest 500 invitations.`}</p>
      )}

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Revoke the invitation?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? t`${revokeTarget.email} can no longer join ${revokeTarget.workspaceName ?? '—'} with it.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRevoke()}>{t`Revoke`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminInvitationsPage;
