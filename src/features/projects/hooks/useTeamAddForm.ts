import { useState } from 'react';
import type { KnownPerson } from '@/features/projects/lib/knownPeople';
import type { AddMemberInput } from '@/features/projects/components/projectCard/TeamBlock';

/**
 * The "add to team" form: a workspace person or an external contact, with the
 * project-local role and tag. Closes and clears itself once the add succeeds.
 */
export const useTeamAddForm = (onAddMember: (input: AddMemberInput) => Promise<boolean>) => {
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<'workspace' | 'external'>('workspace');
  const [addAssigneeId, setAddAssigneeId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState('');
  const [addTag, setAddTag] = useState('');
  const [addExternalName, setAddExternalName] = useState('');
  const [addExternalCompany, setAddExternalCompany] = useState('');
  const [addExternalEmail, setAddExternalEmail] = useState('');
  const [addExternalPhone, setAddExternalPhone] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const submitAdd = async () => {
    if (addSubmitting) return;
    if (addKind === 'workspace') {
      if (!addAssigneeId) return;
      setAddSubmitting(true);
      try {
        const ok = await onAddMember({
          kind: 'workspace',
          assigneeId: addAssigneeId,
          role: addRole.trim() || null,
          tag: addTag.trim() || null,
        });
        if (ok) {
          resetAddForm();
          setAddOpen(false);
        }
      } finally {
        setAddSubmitting(false);
      }
      return;
    }
    if (!addExternalName.trim()) return;
    setAddSubmitting(true);
    try {
      const ok = await onAddMember({
        kind: 'external',
        name: addExternalName.trim(),
        company: addExternalCompany.trim() || null,
        role: addRole.trim() || null,
        tag: addTag.trim() || null,
        email: addExternalEmail.trim() || null,
        phone: addExternalPhone.trim() || null,
      });
      if (ok) {
        resetAddForm();
        setAddOpen(false);
      }
    } finally {
      setAddSubmitting(false);
    }
  };

  // Autofill the external-member draft from a previously-entered person. Only
  // fields the person actually has are set, so picking never wipes a field.
  const fillExternalFromPerson = (person: KnownPerson) => {
    setAddExternalName(person.name);
    if (person.company) setAddExternalCompany(person.company);
    if (person.email) setAddExternalEmail(person.email);
    if (person.phone) setAddExternalPhone(person.phone);
    if (person.role) setAddRole(person.role);
    if (person.tag) setAddTag(person.tag);
  };

  const resetAddForm = () => {
    setAddAssigneeId(null);
    setAddRole('');
    setAddTag('');
    setAddExternalName('');
    setAddExternalCompany('');
    setAddExternalEmail('');
    setAddExternalPhone('');
  };

  return {
    addOpen,
    setAddOpen,
    addKind,
    setAddKind,
    addAssigneeId,
    setAddAssigneeId,
    addRole,
    setAddRole,
    addTag,
    setAddTag,
    addExternalName,
    setAddExternalName,
    addExternalCompany,
    setAddExternalCompany,
    addExternalEmail,
    setAddExternalEmail,
    addExternalPhone,
    setAddExternalPhone,
    addSubmitting,
    setAddSubmitting,
    submitAdd,
    fillExternalFromPerson,
    resetAddForm,
  };
};

export type TeamAddForm = ReturnType<typeof useTeamAddForm>;
