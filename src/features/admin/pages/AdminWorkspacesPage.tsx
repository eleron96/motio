import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore, AdminWorkspace } from '@/features/auth/store/authStore';
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
import { formatDate, formatDateCompact, shortId } from '@/features/admin/lib/format';

const AdminWorkspacesPage: React.FC = () => {
  const {
    adminWorkspaces,
    adminWorkspacesLoading,
    adminWorkspacesError,
    fetchAdminWorkspaces,
    updateAdminWorkspace,
    deleteAdminWorkspace,
  } = useAuthStore(useShallow((state) => ({
    adminWorkspaces: state.adminWorkspaces,
    adminWorkspacesLoading: state.adminWorkspacesLoading,
    adminWorkspacesError: state.adminWorkspacesError,
    fetchAdminWorkspaces: state.fetchAdminWorkspaces,
    updateAdminWorkspace: state.updateAdminWorkspace,
    deleteAdminWorkspace: state.deleteAdminWorkspace,
  })));
  const locale = useLocaleStore((state) => state.locale);

  const [workspaceSearch, setWorkspaceSearch] = useState('');

  const [workspaceEditOpen, setWorkspaceEditOpen] = useState(false);
  const [workspaceEditTarget, setWorkspaceEditTarget] = useState<AdminWorkspace | null>(null);
  const [workspaceEditName, setWorkspaceEditName] = useState('');
  const [workspaceEditError, setWorkspaceEditError] = useState('');
  const [workspaceEditSubmitting, setWorkspaceEditSubmitting] = useState(false);

  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<AdminWorkspace | null>(null);
  const [workspaceDeleteError, setWorkspaceDeleteError] = useState('');
  const [workspaceDeleteSubmitting, setWorkspaceDeleteSubmitting] = useState(false);

  useEffect(() => {
    fetchAdminWorkspaces();
  }, [fetchAdminWorkspaces]);

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

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
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
          <div className="overflow-x-auto rounded-md border">
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
      </div>
    </TooltipProvider>
  );
};

export default AdminWorkspacesPage;
