import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAuthStore,
  AdminUser,
  AdminWorkspace,
  BackupEntry,
} from '@/features/auth/store/authStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import type { Locale } from '@/shared/lib/locale';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';

const formatDate = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const language = locale === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleString(language);
};

const formatDateCompact = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const language = locale === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleDateString(language);
};

const formatWorkspaceSummary = (workspaces: AdminUser['workspaces']) => {
  if (workspaces.length === 0) return '—';
  const preview = workspaces.slice(0, 3).map((workspace) => `${workspace.name} (${workspace.role})`);
  const suffix = workspaces.length > 3 ? ` +${workspaces.length - 3}` : '';
  return `${preview.join(', ')}${suffix}`;
};

const formatStorageMain = (value?: number) => {
  if (!value && value !== 0) return '—';
  const safe = Math.max(0, value);
  const mbThreshold = 1024 * 1024;
  const gbThreshold = 1024 * 1024 * 1024;
  if (safe < mbThreshold) {
    return `${(safe / 1024).toFixed(1)} KB`;
  }
  if (safe < gbThreshold) {
    return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  }
  const gb = safe / gbThreshold;
  return `${gb.toFixed(2)} GB`;
};

const formatStorageExactBytes = (value?: number) => {
  if (!value && value !== 0) return 'No storage data';
  const safe = Math.max(0, value);
  return `${safe.toLocaleString('en-US')} B`;
};

const shortId = (value: string, start = 8, end = 6) => {
  if (!value) return '—';
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
};

const formatBackupType = (type: BackupEntry['type']) => {
  if (type === 'daily') return 'Daily';
  if (type === 'pre-restore') return 'Pre-restore';
  return 'Manual';
};

const AdminUsersPage: React.FC = () => {
  usePageSeo({
    title: 'Motio — Admin',
    description: 'Private admin panel in Motio.',
    canonicalPath: '/app/admin/users',
    robots: 'noindex, nofollow',
  });

  const {
    user,
    isSuperAdmin,
    adminUsers,
    adminUsersLoading,
    adminUsersError,
    fetchAdminUsers,
    adminWorkspaces,
    adminWorkspacesLoading,
    adminWorkspacesError,
    fetchAdminWorkspaces,
    updateAdminWorkspace,
    deleteAdminWorkspace,
    backups,
    backupsLoading,
    backupsError,
    fetchBackups,
    createBackup,
    restoreBackup,
    uploadBackup,
    downloadBackup,
    renameBackup,
    deleteBackup,
    signOut,
  } = useAuthStore();
  const locale = useLocaleStore((state) => state.locale);

  const [tab, setTab] = useState<'users' | 'workspaces' | 'backups'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [workspacesDialogOpen, setWorkspacesDialogOpen] = useState(false);
  const [workspacesTarget, setWorkspacesTarget] = useState<AdminUser | null>(null);

  const [workspaceEditOpen, setWorkspaceEditOpen] = useState(false);
  const [workspaceEditTarget, setWorkspaceEditTarget] = useState<AdminWorkspace | null>(null);
  const [workspaceEditName, setWorkspaceEditName] = useState('');
  const [workspaceEditError, setWorkspaceEditError] = useState('');
  const [workspaceEditSubmitting, setWorkspaceEditSubmitting] = useState(false);

  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<AdminWorkspace | null>(null);
  const [workspaceDeleteError, setWorkspaceDeleteError] = useState('');
  const [workspaceDeleteSubmitting, setWorkspaceDeleteSubmitting] = useState(false);

  const [backupCreateSubmitting, setBackupCreateSubmitting] = useState(false);
  const [backupCreateError, setBackupCreateError] = useState('');
  const [backupActionSubmitting, setBackupActionSubmitting] = useState(false);
  const [backupActionError, setBackupActionError] = useState('');
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [backupRestoreTarget, setBackupRestoreTarget] = useState<BackupEntry | null>(null);
  const [backupRestoreError, setBackupRestoreError] = useState('');
  const [backupRestoreSubmitting, setBackupRestoreSubmitting] = useState(false);
  const [backupRenameOpen, setBackupRenameOpen] = useState(false);
  const [backupRenameTarget, setBackupRenameTarget] = useState<BackupEntry | null>(null);
  const [backupRenameValue, setBackupRenameValue] = useState('');
  const [backupRenameSubmitting, setBackupRenameSubmitting] = useState(false);
  const [backupRenameError, setBackupRenameError] = useState('');
  const [backupDeleteOpen, setBackupDeleteOpen] = useState(false);
  const [backupDeleteTarget, setBackupDeleteTarget] = useState<BackupEntry | null>(null);
  const [backupDeleteSubmitting, setBackupDeleteSubmitting] = useState(false);
  const [backupDeleteError, setBackupDeleteError] = useState('');
  const backupUploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchAdminUsers();
    fetchAdminWorkspaces();
    fetchBackups();
  }, [fetchAdminUsers, fetchAdminWorkspaces, fetchBackups, isSuperAdmin]);

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

  const filteredWorkspaces = useMemo(() => {
    const query = workspaceSearch.trim().toLowerCase();
    if (!query) return adminWorkspaces;
    return adminWorkspaces.filter((item) => (
      item.name.toLowerCase().includes(query)
      || item.id.toLowerCase().includes(query)
      || (item.ownerEmail ?? '').toLowerCase().includes(query)
      || (item.ownerDisplayName ?? '').toLowerCase().includes(query)
    ));
  }, [adminWorkspaces, workspaceSearch]);

  const openWorkspacesDialog = (target: AdminUser) => {
    setWorkspacesTarget(target);
    setWorkspacesDialogOpen(true);
  };

  const openWorkspaceEdit = (workspace: AdminWorkspace) => {
    setWorkspaceEditTarget(workspace);
    setWorkspaceEditName(workspace.name);
    setWorkspaceEditError('');
    setWorkspaceEditOpen(true);
  };

  const handleUpdateWorkspace = async () => {
    if (!workspaceEditTarget) return;
    const name = workspaceEditName.trim();
    if (!name) {
      setWorkspaceEditError('Workspace name is required.');
      return;
    }
    setWorkspaceEditSubmitting(true);
    setWorkspaceEditError('');
    const result = await updateAdminWorkspace(workspaceEditTarget.id, name);
    if (result.error) {
      setWorkspaceEditError(result.error);
      setWorkspaceEditSubmitting(false);
      return;
    }
    await fetchAdminWorkspaces();
    setWorkspaceEditSubmitting(false);
    setWorkspaceEditOpen(false);
  };

  const openWorkspaceDelete = (workspace: AdminWorkspace) => {
    setWorkspaceDeleteTarget(workspace);
    setWorkspaceDeleteError('');
    setWorkspaceDeleteOpen(true);
  };

  const handleDeleteWorkspace = async () => {
    if (!workspaceDeleteTarget) return;
    setWorkspaceDeleteSubmitting(true);
    setWorkspaceDeleteError('');
    const result = await deleteAdminWorkspace(workspaceDeleteTarget.id);
    if (result.error) {
      setWorkspaceDeleteError(result.error);
      setWorkspaceDeleteSubmitting(false);
      return;
    }
    await fetchAdminWorkspaces();
    setWorkspaceDeleteSubmitting(false);
    setWorkspaceDeleteOpen(false);
    setWorkspaceDeleteTarget(null);
  };

  const handleCreateBackup = async () => {
    setBackupCreateSubmitting(true);
    setBackupCreateError('');
    setBackupActionError('');
    const result = await createBackup();
    if (result.error) {
      setBackupCreateError(result.error);
      setBackupCreateSubmitting(false);
      return;
    }
    await fetchBackups();
    setBackupCreateSubmitting(false);
  };

  const openBackupUploadDialog = () => {
    setBackupActionError('');
    backupUploadInputRef.current?.click();
  };

  const handleUploadBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBackupActionSubmitting(true);
    setBackupActionError('');
    const result = await uploadBackup(file);
    if (result.error) {
      setBackupActionError(result.error);
      setBackupActionSubmitting(false);
      return;
    }
    await fetchBackups();
    setBackupActionSubmitting(false);
  };

  const handleDownloadBackup = async (target: BackupEntry) => {
    setBackupActionSubmitting(true);
    setBackupActionError('');
    const result = await downloadBackup(target.name);
    if (result.error) {
      setBackupActionError(result.error);
    }
    setBackupActionSubmitting(false);
  };

  const openBackupRename = (target: BackupEntry) => {
    setBackupRenameTarget(target);
    setBackupRenameValue(target.name);
    setBackupRenameError('');
    setBackupRenameOpen(true);
  };

  const handleRenameBackup = async () => {
    if (!backupRenameTarget) return;
    const nextName = backupRenameValue.trim();
    if (!nextName) {
      setBackupRenameError('Backup name is required.');
      return;
    }
    setBackupRenameSubmitting(true);
    setBackupRenameError('');
    const result = await renameBackup(backupRenameTarget.name, nextName);
    if (result.error) {
      setBackupRenameError(result.error);
      setBackupRenameSubmitting(false);
      return;
    }
    await fetchBackups();
    setBackupRenameSubmitting(false);
    setBackupRenameOpen(false);
    setBackupRenameTarget(null);
  };

  const openBackupDelete = (target: BackupEntry) => {
    setBackupDeleteTarget(target);
    setBackupDeleteError('');
    setBackupDeleteOpen(true);
  };

  const handleDeleteBackup = async () => {
    if (!backupDeleteTarget) return;
    setBackupDeleteSubmitting(true);
    setBackupDeleteError('');
    const result = await deleteBackup(backupDeleteTarget.name);
    if (result.error) {
      setBackupDeleteError(result.error);
      setBackupDeleteSubmitting(false);
      return;
    }
    await fetchBackups();
    setBackupDeleteSubmitting(false);
    setBackupDeleteOpen(false);
    setBackupDeleteTarget(null);
  };

  const openBackupRestore = (target: BackupEntry) => {
    setBackupRestoreTarget(target);
    setBackupRestoreError('');
    setBackupActionError('');
    setBackupRestoreOpen(true);
  };

  const handleRestoreBackup = async () => {
    if (!backupRestoreTarget) return;
    setBackupRestoreSubmitting(true);
    setBackupRestoreError('');
    const result = await restoreBackup(backupRestoreTarget.name);
    if (result.error) {
      setBackupRestoreError(result.error);
      setBackupRestoreSubmitting(false);
      return;
    }
    await fetchBackups();
    setBackupRestoreSubmitting(false);
    setBackupRestoreOpen(false);
    setBackupRestoreTarget(null);
  };

  const workspaceDetails = workspacesTarget?.workspaces ?? [];

  if (!user) {
    return null;
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t`Access denied`}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t`Only super admins can access this page.`}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Admin console</CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="outline" onClick={() => signOut()}>
                {t`Sign out`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TooltipProvider delayDuration={150}>
              <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              <TabsList className="flex flex-wrap w-full h-auto items-start justify-start gap-2 mb-4">
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
                <TabsTrigger value="backups">Backups</TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-4">
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
                  <div className="rounded-md border">
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
              </TabsContent>

              <TabsContent value="workspaces" className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Search by name or owner..."
                    value={workspaceSearch}
                    onChange={(event) => setWorkspaceSearch(event.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => fetchAdminWorkspaces()}>
                    Refresh
                  </Button>
                </div>

                {adminWorkspacesError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t`Error`}</AlertTitle>
                    <AlertDescription>{adminWorkspacesError}</AlertDescription>
                  </Alert>
                )}

                {adminWorkspacesLoading ? (
                  <div className="py-6 text-sm text-muted-foreground">{t`Loading workspaces...`}</div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Members</TableHead>
                          <TableHead>Tasks</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWorkspaces.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                              No workspaces.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredWorkspaces.map((workspace) => (
                            <TableRow key={workspace.id}>
                              <TableCell className="font-medium">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="cursor-default">
                                      <div className="max-w-[220px] truncate">{workspace.name}</div>
                                      <div className="text-xs text-muted-foreground">{shortId(workspace.id)}</div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      <div>{workspace.name}</div>
                                      <div className="text-xs">{workspace.id}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-block max-w-[220px] truncate cursor-default align-bottom">
                                      {workspace.ownerDisplayName ?? workspace.ownerEmail ?? shortId(workspace.ownerId)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {workspace.ownerDisplayName ?? workspace.ownerEmail ?? workspace.ownerId}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-sm">{workspace.membersCount}</TableCell>
                              <TableCell className="text-sm">{workspace.tasksCount}</TableCell>
                              <TableCell className="text-xs">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default">{formatDateCompact(workspace.createdAt, locale)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>{formatDate(workspace.createdAt, locale)}</TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openWorkspaceEdit(workspace)}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => openWorkspaceDelete(workspace)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="backups" className="space-y-4">
                <input
                  ref={backupUploadInputRef}
                  type="file"
                  accept=".dump,application/octet-stream"
                  className="hidden"
                  onChange={handleUploadBackup}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={backupCreateSubmitting}
                  >
                    Create backup
                  </Button>
                  <Button type="button" variant="outline" onClick={() => fetchBackups()}>
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openBackupUploadDialog}
                    disabled={backupActionSubmitting}
                  >
                    Upload backup
                  </Button>
                </div>

                {backupCreateError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t`Error`}</AlertTitle>
                    <AlertDescription>{backupCreateError}</AlertDescription>
                  </Alert>
                )}

                {backupsError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t`Error`}</AlertTitle>
                    <AlertDescription>{backupsError}</AlertDescription>
                  </Alert>
                )}

                {backupActionError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t`Error`}</AlertTitle>
                    <AlertDescription>{backupActionError}</AlertDescription>
                  </Alert>
                )}

                {backupsLoading ? (
                  <div className="py-6 text-sm text-muted-foreground">{t`Loading backups...`}</div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-sm text-muted-foreground">
                              No backups.
                            </TableCell>
                          </TableRow>
                        ) : (
                          backups.map((item) => (
                            <TableRow key={item.name}>
                              <TableCell className="font-medium">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-block max-w-[260px] truncate cursor-default align-bottom">
                                      {item.name}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{item.name}</TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatBackupType(item.type)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default">{formatStorageMain(item.size)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Exact size: {formatStorageExactBytes(item.size)}
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
                              <TableCell className="text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleDownloadBackup(item)}
                                    disabled={backupActionSubmitting}
                                  >
                                    Download
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openBackupRename(item)}
                                    disabled={backupRenameSubmitting || backupDeleteSubmitting || backupRestoreSubmitting}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openBackupDelete(item)}
                                    disabled={backupRenameSubmitting || backupDeleteSubmitting || backupRestoreSubmitting}
                                  >
                                    Delete
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => openBackupRestore(item)}
                                    disabled={backupRenameSubmitting || backupDeleteSubmitting || backupRestoreSubmitting}
                                  >
                                    Restore
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
              </Tabs>
            </TooltipProvider>
          </CardContent>
        </Card>
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

      <Dialog open={workspaceEditOpen} onOpenChange={setWorkspaceEditOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription className="sr-only">
              Rename the selected workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={workspaceEditName}
              onChange={(event) => setWorkspaceEditName(event.target.value)}
              placeholder="Workspace name"
            />
            {workspaceEditError && (
              <div className="text-sm text-destructive">{workspaceEditError}</div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWorkspaceEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleUpdateWorkspace} disabled={workspaceEditSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={workspaceDeleteOpen} onOpenChange={setWorkspaceDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The workspace and all its data will be deleted permanently.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {workspaceDeleteError && (
            <div className="text-sm text-destructive">{workspaceDeleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteWorkspace();
              }}
              disabled={workspaceDeleteSubmitting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={backupRenameOpen} onOpenChange={setBackupRenameOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rename backup</DialogTitle>
            <DialogDescription className="sr-only">
              Change backup file name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={backupRenameValue}
              onChange={(event) => setBackupRenameValue(event.target.value)}
              placeholder="backup-name.dump"
            />
            {backupRenameError && (
              <div className="text-sm text-destructive">{backupRenameError}</div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBackupRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleRenameBackup} disabled={backupRenameSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={backupDeleteOpen} onOpenChange={setBackupDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete backup {backupDeleteTarget?.name ?? '—'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {backupDeleteError && (
            <div className="text-sm text-destructive">{backupDeleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteBackup();
              }}
              disabled={backupDeleteSubmitting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={backupRestoreOpen} onOpenChange={setBackupRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {t({
                message: 'The database will be replaced with backup {name}.',
                values: { name: backupRestoreTarget?.name ?? '—' },
              })}
              {' '}
              {t`All current data will be lost.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {backupRestoreError && (
            <div className="text-sm text-destructive">{backupRestoreError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRestoreBackup();
              }}
              disabled={backupRestoreSubmitting}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsersPage;
