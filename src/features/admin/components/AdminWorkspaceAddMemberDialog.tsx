import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import {
  useAdminStore,
  type AdminWorkspace,
  type PickablePerson,
} from '@/features/admin/store/adminStore';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import { AdminUserPicker } from '@/features/admin/components/AdminUserPicker';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';

interface AdminWorkspaceAddMemberDialogProps {
  /** The workspace to add someone to; null keeps the dialog closed. */
  workspace: AdminWorkspace | null;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

const personName = (person: PickablePerson | undefined) => (
  person?.displayName?.trim() || person?.email || ''
);

/**
 * Puts an existing account into a workspace right away, without an invitation
 * or an email: for installs where people sign in through the company's own
 * identity provider and no mail goes out. Workspace admins keep inviting.
 */
export const AdminWorkspaceAddMemberDialog: React.FC<AdminWorkspaceAddMemberDialogProps> = ({
  workspace,
  onOpenChange,
  onAdded,
}) => {
  const { loadPickablePeople, addAdminWorkspaceMember } = useAdminStore(useShallow((state) => ({
    loadPickablePeople: state.loadPickablePeople,
    addAdminWorkspaceMember: state.addAdminWorkspaceMember,
  })));
  const [people, setPeople] = useState<PickablePerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const workspaceId = workspace?.id ?? null;

  useEffect(() => {
    if (!workspaceId) return;
    setUserId('');
    setRole('viewer');
    setError('');
    let cancelled = false;
    setPeopleLoading(true);
    void loadPickablePeople().then((result) => {
      if (cancelled) return;
      setPeople(result.people);
      setError(result.error ?? '');
      setPeopleLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, loadPickablePeople]);

  const handleSubmit = async () => {
    if (!workspace || !userId) return;
    const name = personName(people.find((person) => person.id === userId)) || userId;
    const workspaceName = workspace.name;
    setSubmitting(true);
    setError('');
    const result = await addAdminWorkspaceMember(workspace.id, userId, role);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.outcome === 'limit_reached') {
      setError(t`${name} is already in 5 workspaces, the most one account can join.`);
      return;
    }
    if (result.outcome === 'already_member') {
      toast.info(t`${name} is already a member of ${workspaceName}.`);
    } else {
      toast.success(t`${name} was added to ${workspaceName}.`);
      onAdded();
    }
    onOpenChange(false);
  };

  const workspaceName = workspace?.name ?? '';

  return (
    <Dialog open={workspace !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t`Add member to ${workspaceName}`}</DialogTitle>
          <DialogDescription>
            {t`The person joins right away, without an invitation or an email. The list shows everyone who has signed in to Motio at least once.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {peopleLoading ? (
            <div className="text-sm text-muted-foreground">{t`Loading data...`}</div>
          ) : (
            <AdminUserPicker users={people} value={userId} onChange={setUserId} />
          )}
          <div className="space-y-1">
            <Label>{t`Role`}</Label>
            <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}>
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
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t`Cancel`}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || !userId}>
            {t`Add member`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
