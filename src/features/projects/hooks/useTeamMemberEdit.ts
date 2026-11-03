import { useState } from 'react';
import type { ProjectMember } from '@/features/planner/types/planner';
import type { ResolvedMember } from '@/features/projects/lib/teamMembers';

interface UseTeamMemberEditOptions {
  isMobile: boolean;
  onUpdateAssigneeContact: (assigneeId: string, email: string | null, phone: string | null) => Promise<boolean>;
  onUpdateExternalMember: (
    memberId: string,
    updates: Partial<Pick<ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ) => Promise<boolean>;
  /** On a phone the edit form is a sheet; it opens for this member. */
  onBeginMobileEdit: (member: ResolvedMember) => void;
}

/**
 * Editing one team member: contacts of a workspace person (owned by their
 * assignee row) or every field of an external contact, plus the project-local
 * role and tag. The draft stays open when a save fails.
 */
export const useTeamMemberEdit = ({
  isMobile,
  onUpdateAssigneeContact,
  onUpdateExternalMember,
  onBeginMobileEdit,
}: UseTeamMemberEditOptions) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [editingTag, setEditingTag] = useState('');
  // External members get extra editable fields — name, company, role —
  // hidden from workspace members whose identity lives in their assignee row.
  const [editingName, setEditingName] = useState('');
  const [editingCompany, setEditingCompany] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [editingSubmitting, setEditingSubmitting] = useState(false);

  const hydrateEditState = (member: ResolvedMember) => {
    setEditingId(member.memberRowId ?? member.assignee?.id ?? null);
    if (member.assignee) {
      setEditingEmail(member.assignee.email ?? '');
      setEditingPhone(member.assignee.phone ?? '');
      setEditingName('');
      setEditingCompany('');
    } else if (member.external) {
      setEditingEmail(member.external.email ?? '');
      setEditingPhone(member.external.phone ?? '');
      setEditingName(member.external.name ?? '');
      setEditingCompany(member.external.company ?? '');
    }
    setEditingTag(member.tag ?? '');
    setEditingRole(member.role ?? '');
  };

  const beginEdit = (member: ResolvedMember) => {
    hydrateEditState(member);
    if (isMobile) {
      onBeginMobileEdit(member);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingEmail('');
    setEditingPhone('');
    setEditingTag('');
    setEditingName('');
    setEditingCompany('');
    setEditingRole('');
  };

  const saveEdit = async (member: ResolvedMember) => {
    if (editingSubmitting) return;
    setEditingSubmitting(true);
    try {
      const email = editingEmail.trim() || null;
      const phone = editingPhone.trim() || null;
      const tag = editingTag.trim() || null;
      const role = editingRole.trim() || null;
      const name = editingName.trim();
      const company = editingCompany.trim() || null;
      let ok = true;
      if (member.assignee) {
        ok = await onUpdateAssigneeContact(member.assignee.id, email, phone);
        if (ok && member.memberRowId) {
          // Workspace members can still edit their project-local tag and role
          // here; their name/company/contacts on the assignee row are owned
          // by the Members page.
          const updates: Parameters<typeof onUpdateExternalMember>[1] = {};
          if (tag !== (member.tag ?? null)) updates.tag = tag;
          if (role !== (member.role ?? null)) updates.role = role;
          if (Object.keys(updates).length > 0) {
            ok = await onUpdateExternalMember(member.memberRowId, updates);
          }
        }
      } else if (member.external && member.memberRowId) {
        // External members are project-local; we own all of their fields and
        // can update the lot in one round-trip.
        if (!name) {
          // Empty name is invalid for an external row — keep the editor open.
          return;
        }
        ok = await onUpdateExternalMember(member.memberRowId, {
          externalName: name,
          externalCompany: company,
          externalEmail: email,
          externalPhone: phone,
          tag,
          role,
        });
      }
      // Only close the editor when every write succeeded so the user keeps
      // their draft on failure.
      if (ok) cancelEdit();
    } finally {
      setEditingSubmitting(false);
    }
  };

  return {
    editingId,
    editingEmail,
    setEditingEmail,
    editingPhone,
    setEditingPhone,
    editingTag,
    setEditingTag,
    editingName,
    setEditingName,
    editingCompany,
    setEditingCompany,
    editingRole,
    setEditingRole,
    editingSubmitting,
    beginEdit,
    cancelEdit,
    saveEdit,
  };
};

export type TeamMemberEdit = ReturnType<typeof useTeamMemberEdit>;
