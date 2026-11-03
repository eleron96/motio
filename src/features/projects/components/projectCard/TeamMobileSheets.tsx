import React from 'react';
import { t } from '@lingui/macro';
import type { Assignee } from '@/features/planner/types/planner';
import { type ResolvedMember } from '@/features/projects/lib/teamMembers';
import type { TeamMemberEdit } from '@/features/projects/hooks/useTeamMemberEdit';
import type { TeamAddForm } from '@/features/projects/hooks/useTeamAddForm';
import { MobileFormSheet } from './MobileFormSheet';
import { Input } from '@/shared/ui/input';
import type { AddMemberInput } from './TeamBlock';

interface TeamMobileSheetsProps {
  canEditMembers: boolean;
  isMobile: boolean;
  addForm: TeamAddForm;
  editForm: TeamMemberEdit;
  availableForAdd: Assignee[];
  mobileAddOpen: boolean;
  setMobileAddOpen: (open: boolean) => void;
  mobileEditMember: ResolvedMember | null;
  setMobileEditMember: (member: ResolvedMember | null) => void;
  mobileRemoveMember: ResolvedMember | null;
  setMobileRemoveMember: (member: ResolvedMember | null) => void;
  onAddMember: (input: AddMemberInput) => Promise<boolean>;
  onRemoveMember: (memberId: string) => Promise<boolean>;
}

/** On a phone, adding, editing and removing team members happen in bottom sheets. */
export const TeamMobileSheets: React.FC<TeamMobileSheetsProps> = ({
  canEditMembers,
  isMobile,
  addForm,
  editForm,
  availableForAdd,
  mobileAddOpen,
  setMobileAddOpen,
  mobileEditMember,
  setMobileEditMember,
  mobileRemoveMember,
  setMobileRemoveMember,
  onAddMember,
  onRemoveMember,
}) => {
  const {
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
    resetAddForm,
  } = addForm;
  const {
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
    cancelEdit,
    saveEdit,
  } = editForm;

  return (
    <>
    {/* M3: bottom-sheet variants of the team add / edit / remove flows.
        State + submit handlers are shared with the desktop dropdown so we
        don't duplicate validation logic. */}
    {canEditMembers && isMobile && (
      <MobileFormSheet
        open={mobileAddOpen}
        onClose={() => setMobileAddOpen(false)}
        onSubmit={async () => {
          // Mobile add bypasses `submitAdd()` so we can keep the sheet
          // open on failure (silent-success guard from P1). Validation is
          // already gated by `canSave` below.
          if (addSubmitting) return;
          setAddSubmitting(true);
          try {
            const payload: AddMemberInput = addKind === 'workspace'
              ? { kind: 'workspace', assigneeId: addAssigneeId!, role: addRole.trim() || null, tag: addTag.trim() || null }
              : {
                  kind: 'external',
                  name: addExternalName.trim(),
                  company: addExternalCompany.trim() || null,
                  role: addRole.trim() || null,
                  tag: addTag.trim() || null,
                  email: addExternalEmail.trim() || null,
                  phone: addExternalPhone.trim() || null,
                };
            const ok = await onAddMember(payload);
            if (ok) {
              resetAddForm();
              setMobileAddOpen(false);
            }
          } finally {
            setAddSubmitting(false);
          }
        }}
        title={t`Add team member`}
        submitting={addSubmitting}
        canSave={addKind === 'workspace' ? !!addAssigneeId : addExternalName.trim().length > 0}
        saveLabel={t`Add`}
      >
        <div className="flex gap-1 rounded-md bg-muted p-1">
          <button
            type="button"
            onClick={() => setAddKind('workspace')}
            className={`flex-1 rounded px-2 py-1.5 text-[12px] font-medium ${
              addKind === 'workspace' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t`Motio`}
          </button>
          <button
            type="button"
            onClick={() => setAddKind('external')}
            className={`flex-1 rounded px-2 py-1.5 text-[12px] font-medium ${
              addKind === 'external' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t`External`}
          </button>
        </div>
        {addKind === 'workspace' ? (
          <select
            value={addAssigneeId ?? ''}
            onChange={(event) => setAddAssigneeId(event.target.value || null)}
            className="rounded-md border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-primary"
          >
            <option value="">{t`Select a workspace member`}</option>
            {availableForAdd
              .filter((assignee) => assignee.userId)
              .map((assignee) => (
                <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
              ))}
          </select>
        ) : (
          <>
            <Input
              placeholder={t`Full name`}
              value={addExternalName}
              onChange={(event) => setAddExternalName(event.target.value)}
              autoFocus
            />
            <Input
              placeholder={t`Company`}
              value={addExternalCompany}
              onChange={(event) => setAddExternalCompany(event.target.value)}
            />
            <Input
              placeholder="Email"
              type="email"
              value={addExternalEmail}
              onChange={(event) => setAddExternalEmail(event.target.value)}
            />
            <Input
              placeholder={t`Phone`}
              value={addExternalPhone}
              onChange={(event) => setAddExternalPhone(event.target.value)}
            />
          </>
        )}
        <Input
          placeholder={t`Role / job title`}
          value={addRole}
          onChange={(event) => setAddRole(event.target.value)}
        />
        <Input
          placeholder={t`Company / contractor`}
          value={addTag}
          onChange={(event) => setAddTag(event.target.value)}
        />
      </MobileFormSheet>
    )}

    {canEditMembers && isMobile && mobileEditMember && (
      <MobileFormSheet
        open={mobileEditMember !== null}
        onClose={() => {
          setMobileEditMember(null);
          cancelEdit();
        }}
        onSubmit={async () => {
          await saveEdit(mobileEditMember);
          // saveEdit clears editingId on success; if it's still set the
          // mutation failed and we keep the sheet open with the draft.
          if (editingId === null) setMobileEditMember(null);
        }}
        title={mobileEditMember.assignee ? t`Edit contact info` : t`Edit member`}
        submitting={editingSubmitting}
        canSave={!!mobileEditMember.assignee || editingName.trim().length > 0}
        saveLabel={t`Save`}
      >
        {!mobileEditMember.assignee && (
          <>
            <Input
              placeholder={t`Full name`}
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              autoFocus
            />
            <Input
              placeholder={t`Company`}
              value={editingCompany}
              onChange={(event) => setEditingCompany(event.target.value)}
            />
          </>
        )}
        <Input
          type="email"
          placeholder="Email"
          value={editingEmail}
          onChange={(event) => setEditingEmail(event.target.value)}
          autoFocus={!!mobileEditMember.assignee}
        />
        <Input
          placeholder={t`Phone`}
          value={editingPhone}
          onChange={(event) => setEditingPhone(event.target.value)}
        />
        <Input
          placeholder={t`Role / job title`}
          value={editingRole}
          onChange={(event) => setEditingRole(event.target.value)}
        />
        <Input
          placeholder={t`Company / contractor`}
          value={editingTag}
          onChange={(event) => setEditingTag(event.target.value)}
        />
      </MobileFormSheet>
    )}

    {canEditMembers && isMobile && mobileRemoveMember && (
      <MobileFormSheet
        open={mobileRemoveMember !== null}
        onClose={() => setMobileRemoveMember(null)}
        onSubmit={async () => {
          const memberRowId = mobileRemoveMember.memberRowId;
          if (!memberRowId) return;
          const ok = await onRemoveMember(memberRowId);
          if (ok) setMobileRemoveMember(null);
        }}
        title={t`Remove from team`}
        description={t`This will not affect tasks already assigned to ${mobileRemoveMember.assignee?.name ?? mobileRemoveMember.external?.name ?? '—'}.`}
        saveLabel={t`Remove`}
        canSave
      >
        <div className="rounded-md bg-muted px-3 py-2 text-[13px]">
          {mobileRemoveMember.assignee?.name ?? mobileRemoveMember.external?.name}
        </div>
      </MobileFormSheet>
    )}
    </>
  );
};
