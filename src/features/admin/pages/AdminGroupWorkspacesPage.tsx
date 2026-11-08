import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAdminStore } from '@/features/admin/store/adminStore';
import {
  useGroupWorkspacesStore,
  type GroupWorkspaceMapping,
} from '@/features/admin/store/groupWorkspacesStore';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import { formatDate } from '@/features/admin/lib/format';
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
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { toast } from '@/shared/ui/sonner';

const roleLabel = (role: WorkspaceRole) => (
  role === 'admin' ? t`Admin` : role === 'editor' ? t`Editor` : t`Viewer`
);

// Admin console → Group access (self-hosted installs with
// KEYCLOAK_WORKSPACES_FROM_GROUPS=true): a Keycloak group puts its people into
// a workspace with a role the next time they open Motio.
const AdminGroupWorkspacesPage: React.FC = () => {
  const {
    enabled, removeEnabled, mappings, groups, groupsError, loaded, loading, error, load, createMapping, deleteMapping,
  } = useGroupWorkspacesStore(useShallow((state) => ({
    enabled: state.enabled,
    removeEnabled: state.removeEnabled,
    mappings: state.mappings,
    groups: state.groups,
    groupsError: state.groupsError,
    loaded: state.loaded,
    loading: state.loading,
    error: state.error,
    load: state.load,
    createMapping: state.createMapping,
    deleteMapping: state.deleteMapping,
  })));
  const { workspaces, fetchWorkspaces } = useAdminStore(useShallow((state) => ({
    workspaces: state.adminWorkspaces,
    fetchWorkspaces: state.fetchAdminWorkspaces,
  })));
  const locale = useLocaleStore((state) => state.locale);

  const [groupPath, setGroupPath] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GroupWorkspaceMapping | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (enabled) void fetchWorkspaces();
  }, [enabled, fetchWorkspaces]);

  const workspaceName = (id: string) => workspaces.find((workspace) => workspace.id === id)?.name ?? id;

  const handleAdd = async () => {
    setFormError('');
    setSubmitting(true);
    const result = await createMapping({ groupPath: groupPath.trim(), workspaceId, role });
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    const group = groupPath.trim();
    const name = workspaceName(workspaceId);
    if (result.outcome === 'exists') {
      toast.info(t`${group} already puts people into ${name}.`);
      return;
    }
    toast.success(t`People in ${group} join ${name} the next time they open Motio.`);
    setGroupPath('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMapping(deleteTarget.id);
    setDeleteTarget(null);
    if (result.error) toast.error(result.error);
  };

  if (!loaded || (loading && mappings.length === 0 && !error)) {
    return <p className="text-sm text-muted-foreground">{t`Loading…`}</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t`Could not load the groups`}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t`Group access`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t`Turned off on this server. It puts people into workspaces by their Keycloak groups, for example the groups of your own sign-in.`}</p>
          <p>
            {t`To turn it on, set this in .env and run install.sh up:`}
            {' '}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">KEYCLOAK_WORKSPACES_FROM_GROUPS=true</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{t`People in a Keycloak group join its workspace with the role below the next time they open Motio. A group also covers its subgroups. People already in the workspace keep their role.`}</p>
        <p>
          {removeEnabled
            ? t`When someone leaves the group, the access it gave is taken away at their next visit. Access given by hand or by an invitation stays.`
            : t`Access is only added: leaving the group does not take it away.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t`Add a mapping`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="group-workspace-group">{t`Keycloak group`}</Label>
              <Input
                id="group-workspace-group"
                list="group-workspace-groups"
                placeholder="/Design"
                value={groupPath}
                onChange={(event) => setGroupPath(event.target.value)}
              />
              <datalist id="group-workspace-groups">
                {groups.map((path) => <option key={path} value={path} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>{t`Workspace`}</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger aria-label={t`Workspace`}>
                  <SelectValue placeholder={t`Select workspace`} />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t`Role`}</Label>
              <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}>
                <SelectTrigger aria-label={t`Role`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">{t`Viewer`}</SelectItem>
                  <SelectItem value="editor">{t`Editor`}</SelectItem>
                  <SelectItem value="admin">{t`Admin`}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={submitting || !groupPath.trim() || !workspaceId}>
              {t`Add mapping`}
            </Button>
          </div>
          {groupsError && (
            <p className="text-xs text-muted-foreground">
              {t`Keycloak did not list its groups; type the group path as Keycloak shows it, for example /Design.`}
            </p>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </CardContent>
      </Card>

      {mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t`No mappings yet.`}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t`Keycloak group`}</TableHead>
              <TableHead>{t`Workspace`}</TableHead>
              <TableHead>{t`Role`}</TableHead>
              <TableHead className="hidden sm:table-cell">{t`Added`}</TableHead>
              <TableHead className="w-12"><span className="sr-only">{t`Actions`}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-mono text-xs">{mapping.groupPath}</TableCell>
                <TableCell>{mapping.workspaceName ?? workspaceName(mapping.workspaceId)}</TableCell>
                <TableCell>{roleLabel(mapping.role)}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatDate(mapping.createdAt, locale)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t`Remove mapping`}
                    onClick={() => setDeleteTarget(mapping)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove mapping?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeEnabled
                ? t`People who got access only through this group lose it at their next visit.`
                : t`People already in the workspace stay; nobody new joins through this group.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>{t`Remove`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminGroupWorkspacesPage;
