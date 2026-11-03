import { useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { ProjectMember } from '@/features/planner/types/planner';
import type { AddMemberInput } from '@/features/projects/components/projectCard/TeamBlock';

type ContactPayload = {
  customerId: string | null;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  tag: string | null;
};

type ContactUpdates = {
  name?: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  tag?: string | null;
  customerId?: string | null;
};

type ExternalPersonUpdates = {
  externalName: string;
  externalCompany: string | null;
  externalEmail: string | null;
  externalPhone: string | null;
  role: string | null;
  tag: string | null;
};

interface UseProjectRecordActionsOptions {
  /** The page's error banner: cleared before each write, set when one fails. */
  setMutationError: (message: string) => void;
  dateLocale: DateFnsLocale;
}

/**
 * The writes the project card, the customer card and the contacts tab make on
 * their own records — contacts, project members, the notes feed and the
 * project status. Each answers whether it worked; a failure lands in the
 * page's error banner.
 */
export const useProjectRecordActions = ({ setMutationError, dateLocale }: UseProjectRecordActionsOptions) => {
  const {
    addCustomerContact,
    deleteCustomerContact,
    updateCustomerContact,
    addProjectMember,
    deleteProjectMember,
    updateProjectMember,
    addProjectActivity,
    updateProjectActivity,
    deleteProjectActivity,
    setProjectActivityPinned,
    updateAssignee,
    updateProject,
  } = usePlannerStore(useShallow((state) => ({
    addCustomerContact: state.addCustomerContact,
    deleteCustomerContact: state.deleteCustomerContact,
    updateCustomerContact: state.updateCustomerContact,
    addProjectMember: state.addProjectMember,
    deleteProjectMember: state.deleteProjectMember,
    updateProjectMember: state.updateProjectMember,
    addProjectActivity: state.addProjectActivity,
    updateProjectActivity: state.updateProjectActivity,
    deleteProjectActivity: state.deleteProjectActivity,
    setProjectActivityPinned: state.setProjectActivityPinned,
    updateAssignee: state.updateAssignee,
    updateProject: state.updateProject,
  })));

  const handleAddCustomerContact = useCallback(async (payload: ContactPayload): Promise<boolean> => {
    setMutationError('');
    const result = await addCustomerContact(payload);
    if (!result) {
      setMutationError(t`Failed to add customer contact.`);
      return false;
    }
    return true;
  }, [addCustomerContact, setMutationError]);

  const handleDeleteCustomerContact = useCallback(async (id: string): Promise<boolean> => {
    setMutationError('');
    const result = await deleteCustomerContact(id);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [deleteCustomerContact, setMutationError]);

  const handleUpdateCustomerContact = useCallback(async (
    id: string,
    updates: ContactUpdates,
  ): Promise<boolean> => {
    setMutationError('');
    const result = await updateCustomerContact(id, updates);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setMutationError, updateCustomerContact]);

  // "Edit / delete everywhere" for a deduplicated external person: apply the
  // same change to every backing project_members row.
  const handleUpdateExternalPerson = useCallback(async (
    memberIds: string[],
    updates: ExternalPersonUpdates,
  ): Promise<boolean> => {
    setMutationError('');
    const results = await Promise.all(memberIds.map((memberId) => updateProjectMember(memberId, updates)));
    const failed = results.find((result) => result?.error);
    if (failed?.error) {
      setMutationError(failed.error);
      return false;
    }
    return true;
  }, [setMutationError, updateProjectMember]);

  const handleDeleteExternalPerson = useCallback(async (memberIds: string[]): Promise<boolean> => {
    setMutationError('');
    const results = await Promise.all(memberIds.map((memberId) => deleteProjectMember(memberId)));
    const failed = results.find((result) => result?.error);
    if (failed?.error) {
      setMutationError(failed.error);
      return false;
    }
    return true;
  }, [deleteProjectMember, setMutationError]);

  // Project member handlers (workspace + external).
  const handleAddProjectMember = useCallback(async (
    projectId: string,
    input: AddMemberInput,
  ): Promise<boolean> => {
    setMutationError('');
    const payload = input.kind === 'workspace'
      ? {
          projectId,
          assigneeId: input.assigneeId,
          role: input.role,
          tag: input.tag,
          externalName: null,
          externalCompany: null,
          externalEmail: null,
          externalPhone: null,
        }
      : {
          projectId,
          assigneeId: null,
          role: input.role,
          tag: input.tag,
          externalName: input.name,
          externalCompany: input.company,
          externalEmail: input.email,
          externalPhone: input.phone,
        };
    const result = await addProjectMember(payload);
    if (!result) {
      setMutationError(t`Failed to add project member.`);
      return false;
    }
    return true;
  }, [addProjectMember, setMutationError]);

  const handleUpdateExternalMember = useCallback(async (
    memberId: string,
    updates: Partial<Pick<ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ): Promise<boolean> => {
    setMutationError('');
    const result = await updateProjectMember(memberId, updates);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setMutationError, updateProjectMember]);

  const handleRemoveProjectMember = useCallback(async (memberId: string): Promise<boolean> => {
    setMutationError('');
    const result = await deleteProjectMember(memberId);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [deleteProjectMember, setMutationError]);

  const handleUpdateAssigneeContact = useCallback(async (
    assigneeId: string,
    email: string | null,
    phone: string | null,
  ): Promise<boolean> => {
    setMutationError('');
    const result = await updateAssignee(assigneeId, { email, phone });
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setMutationError, updateAssignee]);

  // Activity feed handlers.
  const handleAddProjectActivity = useCallback(async (projectId: string, content: string): Promise<boolean> => {
    setMutationError('');
    const result = await addProjectActivity({ projectId, content });
    if (!result) {
      setMutationError(t`Failed to publish note.`);
      return false;
    }
    return true;
  }, [addProjectActivity, setMutationError]);

  const handleUpdateProjectActivity = useCallback(async (id: string, content: string): Promise<boolean> => {
    setMutationError('');
    const result = await updateProjectActivity(id, { content });
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setMutationError, updateProjectActivity]);

  const handleDeleteProjectActivity = useCallback(async (id: string): Promise<boolean> => {
    setMutationError('');
    const result = await deleteProjectActivity(id);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [deleteProjectActivity, setMutationError]);

  const handleSetProjectActivityPinned = useCallback(async (id: string, pinned: boolean): Promise<boolean> => {
    setMutationError('');
    const result = await setProjectActivityPinned(id, pinned);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setMutationError, setProjectActivityPinned]);

  const formatActivityTimestamp = useCallback((iso: string) => (
    format(parseISO(iso), 'd MMM yyyy, HH:mm', { locale: dateLocale })
  ), [dateLocale]);

  // Inline status edit from the project card header.
  const handleSaveProjectStatus = useCallback(async (projectId: string, next: string | null): Promise<boolean> => {
    setMutationError('');
    const result = await updateProject(projectId, { status: next });
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setMutationError, updateProject]);

  return {
    handleAddCustomerContact,
    handleDeleteCustomerContact,
    handleUpdateCustomerContact,
    handleUpdateExternalPerson,
    handleDeleteExternalPerson,
    handleAddProjectMember,
    handleUpdateExternalMember,
    handleRemoveProjectMember,
    handleUpdateAssigneeContact,
    handleAddProjectActivity,
    handleUpdateProjectActivity,
    handleDeleteProjectActivity,
    handleSetProjectActivityPinned,
    formatActivityTimestamp,
    handleSaveProjectStatus,
  };
};
