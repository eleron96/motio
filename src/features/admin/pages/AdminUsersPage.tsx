import React, { useEffect, useMemo, useState } from 'react';
import { useAdminStore, AdminUser } from '@/features/admin/store/adminStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
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
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useShallow } from 'zustand/react/shallow';
import {
  formatDate,
  formatDateCompact,
  formatStorageExactBytes,
  formatStorageMain,
  formatWorkspaceSummary,
  shortId,
} from '@/features/admin/lib/format';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AdminUsersPage: React.FC = () => {
  const {
    adminUsers,
    adminUsersLoading,
    adminUsersError,
    fetchAdminUsers,
    adminForcePurgeAccount,
  } = useAdminStore(useShallow((state) => ({
    adminUsers: state.adminUsers,
    adminUsersLoading: state.adminUsersLoading,
    adminUsersError: state.adminUsersError,
    fetchAdminUsers: state.fetchAdminUsers,
    adminForcePurgeAccount: state.adminForcePurgeAccount,
  })));
  const locale = useLocaleStore((state) => state.locale);

  const [userSearch, setUserSearch] = useState('');
  const [workspacesDialogOpen, setWorkspacesDialogOpen] = useState(false);
  const [workspacesTarget, setWorkspacesTarget] = useState<AdminUser | null>(null);

  const [forcePurgeUserId, setForcePurgeUserId] = useState('');
  const [forcePurgeConfirmOpen, setForcePurgeConfirmOpen] = useState(false);
  const [forcePurgeSubmitting, setForcePurgeSubmitting] = useState(false);
  const [forcePurgeError, setForcePurgeError] = useState('');
  const [forcePurgeResult, setForcePurgeResult] = useState<
    { userId: string; purgeAfter: string } | null
  >(null);

  useEffect(() => {
    fetchAdminUsers();
  }, [fetchAdminUsers]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return adminUsers;
    return adminUsers.filter((item) => {
      const workspaceNames = item.workspaces.map((workspace) => workspace.name.toLowerCase());
      return (
        (item.email ?? '').toLowerCase().includes(query)
        || item.id.toLowerCase().includes(query)
        || (item.displayName ?? '').toLowerCase().includes(query)
        || workspaceNames.some((name) => name.includes(query))
      );
    });
  }, [adminUsers, userSearch]);

  const openWorkspacesDialog = (target: AdminUser) => {
    setWorkspacesTarget(target);
    setWorkspacesDialogOpen(true);
  };

  const forcePurgeTrimmed = forcePurgeUserId.trim();
  const forcePurgeValid = UUID_PATTERN.test(forcePurgeTrimmed);

  const openForcePurgeConfirm = () => {
    if (!forcePurgeValid) {
      setForcePurgeError(t`Enter a valid user UUID.`);
      return;
    }
    setForcePurgeError('');
    setForcePurgeResult(null);
    setForcePurgeConfirmOpen(true);
  };

  const handleForcePurge = async () => {
    setForcePurgeSubmitting(true);
    setForcePurgeError('');
    const { data, error } = await adminForcePurgeAccount(forcePurgeTrimmed);
    setForcePurgeSubmitting(false);
    if (error) {
      setForcePurgeError(error);
      return;
    }
    if (data) {
      setForcePurgeResult({ userId: data.user_id, purgeAfter: data.purge_after });
    }
    setForcePurgeConfirmOpen(false);
    setForcePurgeUserId('');
  };

  const workspaceDetails = workspacesTarget?.workspaces ?? [];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by email, ID, workspace..."
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
          />
          <Button type="button" variant="outline" onClick={() => fetchAdminUsers(userSearch.trim())}>
            Refresh
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          User create/edit/delete is managed in Keycloak admin console.
        </div>

        {adminUsersError && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{adminUsersError}</AlertDescription>
          </Alert>
        )}

        {adminUsersLoading ? (
          <div className="py-6 text-sm text-muted-foreground">{t`Loading users...`}</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Workspaces</TableHead>
                  <TableHead>Owned</TableHead>
                  <TableHead>Managed</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last sign in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">
                      No users.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.email ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block max-w-[220px] truncate align-bottom">
                                {item.email}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{item.email}</TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{shortId(item.id)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{item.id}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.displayName ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block max-w-[180px] truncate align-bottom">
                                {item.displayName}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{item.displayName}</TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-default">
                              <div className="text-sm text-foreground">{item.workspaceCount}</div>
                              <div className="max-w-[220px] truncate">{formatWorkspaceSummary(item.workspaces)}</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-1">
                              <div>Total: {item.workspaceCount}</div>
                              {item.workspaces.slice(0, 6).map((workspace) => (
                                <div key={`${item.id}-${workspace.id}`} className="text-xs">
                                  {workspace.name} ({workspace.role})
                                </div>
                              ))}
                              {item.workspaces.length > 6 && (
                                <div className="text-xs text-muted-foreground">
                                  +{item.workspaces.length - 6} more
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                        {item.workspaces.length > 0 && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => openWorkspacesDialog(item)}
                          >
                            {t`Details`}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{item.ownedWorkspaceCount}</span>
                          </TooltipTrigger>
                          <TooltipContent>Workspaces where user is owner</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{item.managedWorkspaceCount}</span>
                          </TooltipTrigger>
                          <TooltipContent>Owner or admin workspaces</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-default">
                              <div className="text-sm text-foreground">{formatStorageMain(item.storageUsedBytes)}</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-1">
                              <div>Exact size: {formatStorageExactBytes(item.storageUsedBytes)}</div>
                              <div>Objects: {item.storageObjectsCount}</div>
                              {item.storageObjectsCount > 0 && (
                                <div>
                                  Avg/object: {formatStorageMain(item.storageUsedBytes / item.storageObjectsCount)}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{formatDateCompact(item.createdAt, locale)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{formatDate(item.createdAt, locale)}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{formatDateCompact(item.lastSignInAt, locale)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{formatDate(item.lastSignInAt, locale)}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">{t`Force purge account`}</div>
            <div className="text-xs text-muted-foreground">
              {t`Skip the 30-day grace period for a PENDING_DELETION account. The cron will pick the user on the next tick.`}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Input
              value={forcePurgeUserId}
              placeholder={t`User UUID`}
              onChange={(event) => {
                setForcePurgeUserId(event.target.value);
                setForcePurgeError('');
                setForcePurgeResult(null);
              }}
              data-testid="force-purge-user-id-input"
              disabled={forcePurgeSubmitting}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={openForcePurgeConfirm}
              disabled={forcePurgeSubmitting || !forcePurgeValid}
              data-testid="force-purge-submit-button"
            >
              {t`Purge now`}
            </Button>
          </div>
          {forcePurgeError && (
            <Alert variant="destructive">
              <AlertTitle>{t`Force purge failed`}</AlertTitle>
              <AlertDescription>{forcePurgeError}</AlertDescription>
            </Alert>
          )}
          {forcePurgeResult && (
            <Alert>
              <AlertTitle>{t`Force purge scheduled`}</AlertTitle>
              <AlertDescription>
                <div className="text-xs">
                  {t`User`}: {forcePurgeResult.userId}
                </div>
                <div className="text-xs">
                  {t`purge_after`}: {formatDate(forcePurgeResult.purgeAfter, locale)}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Dialog
          open={workspacesDialogOpen}
          onOpenChange={(open) => {
            setWorkspacesDialogOpen(open);
            if (!open) setWorkspacesTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-[640px]">
            <DialogHeader>
              <DialogTitle>{t`User workspaces`}</DialogTitle>
              <DialogDescription className="sr-only">
                {t`View all workspaces where this user is a member.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {workspacesTarget?.email ?? workspacesTarget?.id ?? '—'}
              </div>
              {workspaceDetails.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t`No workspaces.`}</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workspaceDetails.map((workspace) => (
                        <TableRow key={workspace.id}>
                          <TableCell className="font-medium">{workspace.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{workspace.role}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{workspace.id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWorkspacesDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={forcePurgeConfirmOpen}
          onOpenChange={(open) => {
            if (!forcePurgeSubmitting) setForcePurgeConfirmOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Force purge account?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {t`This will schedule immediate purge for user ${forcePurgeTrimmed}. The user must be in PENDING_DELETION. This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={forcePurgeSubmitting}>{t`Cancel`}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleForcePurge();
                }}
                disabled={forcePurgeSubmitting}
                data-testid="force-purge-confirm-button"
              >
                {t`Purge`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default AdminUsersPage;
