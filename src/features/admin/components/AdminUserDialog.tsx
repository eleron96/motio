import React from 'react';
import { t } from '@lingui/macro';
import type { AdminUser } from '@/features/admin/store/adminStore';
import { useUserDiagnosis } from '@/features/admin/hooks/useUserDiagnosis';
import { AdminUserSignInSection } from '@/features/admin/components/AdminUserSignInSection';
import { formatWorkspaceRole } from '@/features/admin/lib/format';
import type { Locale } from '@/shared/lib/locale';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

/**
 * Admin → Users → Details: a person's workspaces and how they sign in (Keycloak
 * account, providers, groups, super admin, what the group sync would do).
 */
export const AdminUserDialog: React.FC<{
  user: AdminUser | null;
  locale: Locale;
  onClose: () => void;
}> = ({ user, locale, onClose }) => {
  const { diagnosis, loading, error, reload } = useUserDiagnosis(user?.id ?? null);
  const workspaces = user?.workspaces ?? [];

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{user?.displayName || user?.email || user?.id || '—'}</DialogTitle>
          <DialogDescription>{user?.email ?? user?.id ?? '—'}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t`User workspaces`}</h3>
          {workspaces.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t`No workspaces.`}</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t`Name`}</TableHead>
                    <TableHead>{t`Role`}</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map((workspace) => (
                    <TableRow key={workspace.id}>
                      <TableCell className="font-medium">{workspace.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatWorkspaceRole(workspace.role)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{workspace.id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <AdminUserSignInSection
          diagnosis={diagnosis}
          loading={loading}
          error={error}
          locale={locale}
          onReload={() => void reload()}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t`Close`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
