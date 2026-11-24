import { useCallback, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore, type WorkspaceRole } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { Assignee } from '@/features/planner/types/planner';
import { useInstanceSetting } from '@/shared/store/instanceSettingsStore';
import { isAccountlessPerson, normalizeAccountlessName } from '@/shared/domain/accountlessPeople';
import { toast } from '@/shared/ui/sonner';

// People added to the timeline by name, without an account (server setting
// people.withoutAccount). Adding, editing, switching off and inviting from the
// Team page; a workspace admin's job, like invitations.

export type AccountlessPersonForm = {
  /** null while adding a new person. */
  assigneeId: string | null;
  name: string;
  email: string;
  phone: string;
};

export type AccountlessInviteForm = {
  assigneeId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const useAccountlessPeople = ({ isAdmin }: { isAdmin: boolean }) => {
  const enabled = useInstanceSetting('people.withoutAccount');
  const canManage = enabled && isAdmin;

  const { addAssignee, updateAssignee } = usePlannerStore(useShallow((state) => ({
    addAssignee: state.addAssignee,
    updateAssignee: state.updateAssignee,
  })));
  const inviteMember = useAuthStore((state) => state.inviteMember);

  const [personForm, setPersonForm] = useState<AccountlessPersonForm | null>(null);
  const [inviteForm, setInviteForm] = useState<AccountlessInviteForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openAdd = useCallback(() => {
    setError('');
    setPersonForm({ assigneeId: null, name: '', email: '', phone: '' });
  }, []);

  const openEdit = useCallback((assignee: Assignee) => {
    if (!isAccountlessPerson(assignee)) return;
    setError('');
    setPersonForm({
      assigneeId: assignee.id,
      name: assignee.name,
      email: assignee.email ?? '',
      phone: assignee.phone ?? '',
    });
  }, []);

  const openInvite = useCallback((assignee: Assignee) => {
    if (!isAccountlessPerson(assignee)) return;
    setError('');
    setInviteForm({
      assigneeId: assignee.id,
      name: assignee.name,
      email: assignee.email ?? '',
      role: 'editor',
    });
  }, []);

  const closeForms = useCallback(() => {
    setPersonForm(null);
    setInviteForm(null);
    setError('');
  }, []);

  /** Returns the id of the person to show next, or null when nothing was saved. */
  const savePerson = useCallback(async (): Promise<string | null> => {
    if (!canManage || !personForm) return null;
    const name = normalizeAccountlessName(personForm.name);
    if (!name) return null;
    const email = personForm.email.trim() || null;
    const phone = personForm.phone.trim() || null;

    setSaving(true);
    setError('');
    if (personForm.assigneeId) {
      const result = await updateAssignee(personForm.assigneeId, { name, email, phone });
      setSaving(false);
      if (result.error) {
        setError(t`Could not save the changes. Try again.`);
        return null;
      }
      setPersonForm(null);
      return personForm.assigneeId;
    }

    const result = await addAssignee({ name, email, phone, isActive: true });
    setSaving(false);
    if (result.error || !result.assigneeId) {
      setError(t`Could not add the person. Try again.`);
      return null;
    }
    setPersonForm(null);
    return result.assigneeId;
  }, [addAssignee, canManage, personForm, updateAssignee]);

  const setActive = useCallback(async (assignee: Assignee, isActive: boolean) => {
    if (!canManage || !isAccountlessPerson(assignee)) return;
    const result = await updateAssignee(assignee.id, { isActive });
    if (result.error) {
      toast.error(t`Could not save the changes. Try again.`);
    }
  }, [canManage, updateAssignee]);

  const sendInvite = useCallback(async () => {
    if (!canManage || !inviteForm) return;
    const email = inviteForm.email.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError(t`Enter a valid email address.`);
      return;
    }

    setSaving(true);
    setError('');
    const result = await inviteMember(email, inviteForm.role, null, inviteForm.assigneeId);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.alreadyMember) {
      setError(t`This person already has access to the workspace.`);
      return;
    }

    const personName = inviteForm.name;
    setInviteForm(null);
    toast.success(
      result.delivery === 'email'
        ? t`Invitation sent to ${email}`
        : t`Invitation for ${email} is waiting in Motio`,
      {
        description: t`When they accept, the tasks and time off of ${personName} become theirs.`,
      },
    );
  }, [canManage, inviteForm, inviteMember]);

  return {
    enabled,
    canManage,
    personForm,
    setPersonForm,
    inviteForm,
    setInviteForm,
    saving,
    error,
    openAdd,
    openEdit,
    openInvite,
    closeForms,
    savePerson,
    setActive,
    sendInvite,
  };
};

export type AccountlessPeopleFlow = ReturnType<typeof useAccountlessPeople>;
