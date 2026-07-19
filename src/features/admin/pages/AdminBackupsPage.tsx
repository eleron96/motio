import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore, BackupEntry } from '@/features/auth/store/authStore';
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
  formatBackupType,
  formatDate,
  formatDateCompact,
  formatStorageExactBytes,
  formatStorageMain,
} from '@/features/admin/lib/format';

const AdminBackupsPage: React.FC = () => {
  const {
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
  } = useAuthStore(useShallow((state) => ({
    backups: state.backups,
    backupsLoading: state.backupsLoading,
    backupsError: state.backupsError,
    fetchBackups: state.fetchBackups,
    createBackup: state.createBackup,
    restoreBackup: state.restoreBackup,
    uploadBackup: state.uploadBackup,
    downloadBackup: state.downloadBackup,
    renameBackup: state.renameBackup,
    deleteBackup: state.deleteBackup,
  })));
  const locale = useLocaleStore((state) => state.locale);

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
    fetchBackups();
  }, [fetchBackups]);

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

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
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
          <div className="overflow-x-auto rounded-md border">
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
                {t`The database will be replaced with backup ${{ name: backupRestoreTarget?.name ?? '—' }}.`}
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
    </TooltipProvider>
  );
};

export default AdminBackupsPage;
