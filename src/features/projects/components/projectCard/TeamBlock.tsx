import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { Assignee, ProjectMember } from '@/features/planner/types/planner';
import { ContactPopup } from './ContactPopup';

interface TeamBlockProps {
  /**
   * Explicit per-project members. Source of truth for the "team". Phase 4
   * kept legacy task-derived assignees as the *fallback* shown when no
   * explicit members exist yet, so the project doesn't look empty after the
   * migration ships.
   */
  members: ProjectMember[];
  taskFallbackMembers: Assignee[];
  assigneesById: Map<string, Assignee>;
  workspaceAssignees: Assignee[];
  canEdit: boolean;
  onAddMember: (assigneeId: string, role: string | null) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onUpdateAssigneeContact: (assigneeId: string, email: string | null, phone: string | null) => Promise<void>;
}

const buildInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '·';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || first.toUpperCase() || '·';
};

interface ResolvedMember {
  /** project_members row id when explicit, null when only task-derived. */
  memberRowId: string | null;
  assignee: Assignee;
  role: string | null;
}

export const TeamBlock: React.FC<TeamBlockProps> = ({
  members,
  taskFallbackMembers,
  assigneesById,
  workspaceAssignees,
  canEdit,
  onAddMember,
  onRemoveMember,
  onUpdateAssigneeContact,
}) => {
  const [popup, setPopup] = useState<{ contact: ResolvedMember; rect: DOMRect } | null>(null);
  const [addingRole, setAddingRole] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const explicitMode = members.length > 0;

  const beginEdit = (assignee: Assignee) => {
    setEditingId(assignee.id);
    setEditingEmail(assignee.email ?? '');
    setEditingPhone(assignee.phone ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingEmail('');
    setEditingPhone('');
  };

  const saveEdit = async (assigneeId: string) => {
    if (editingSubmitting) return;
    setEditingSubmitting(true);
    try {
      await onUpdateAssigneeContact(
        assigneeId,
        editingEmail.trim() || null,
        editingPhone.trim() || null,
      );
      cancelEdit();
    } finally {
      setEditingSubmitting(false);
    }
  };

  const resolvedMembers = useMemo<ResolvedMember[]>(() => {
    if (explicitMode) {
      return members
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((member) => {
          const assignee = assigneesById.get(member.assigneeId);
          return assignee
            ? { memberRowId: member.id, assignee, role: member.role }
            : null;
        })
        .filter((value): value is ResolvedMember => value !== null);
    }
    return [...taskFallbackMembers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map<ResolvedMember>((assignee) => ({ memberRowId: null, assignee, role: null }));
  }, [assigneesById, explicitMode, members, taskFallbackMembers]);

  const availableForAdd = useMemo(() => {
    const usedIds = new Set(members.map((member) => member.assigneeId));
    return workspaceAssignees
      .filter((assignee) => assignee.isActive && !usedIds.has(assignee.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, workspaceAssignees]);

  const openPopup = (event: React.MouseEvent<HTMLButtonElement>, member: ResolvedMember) => {
    setPopup({ contact: member, rect: event.currentTarget.getBoundingClientRect() });
  };

  const handleAdd = async (assigneeId: string) => {
    const role = addingRole.trim() || null;
    setAddingRole('');
    await onAddMember(assigneeId, role);
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Team`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {resolvedMembers.length}
        </span>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-auto grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t`Add team member`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <div className="space-y-2 p-2">
                <input
                  type="text"
                  placeholder={t`Role on this project (optional)`}
                  value={addingRole}
                  onChange={(event) => setAddingRole(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-56 overflow-y-auto py-1">
                {availableForAdd.length === 0 && (
                  <div className="px-3 py-2 text-[12px] text-muted-foreground">
                    {t`No more workspace assignees to add.`}
                  </div>
                )}
                {availableForAdd.map((assignee) => (
                  <DropdownMenuItem
                    key={assignee.id}
                    onSelect={() => void handleAdd(assignee.id)}
                  >
                    <span className="truncate">{assignee.name}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!explicitMode && resolvedMembers.length > 0 && (
        <div className="mb-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          {t`These members are derived from this project's tasks. Use + to pin them explicitly.`}
        </div>
      )}

      {resolvedMembers.length === 0 ? (
        <div className="text-ui-xs text-muted-foreground">
          {t`No team members yet. Use + to add one.`}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {resolvedMembers.map((member) => {
            const { assignee, role, memberRowId } = member;
            const initials = buildInitials(assignee.name);
            const hasContact = Boolean(assignee.email || assignee.phone);
            const isEditing = editingId === assignee.id;
            return (
              <li
                key={memberRowId ?? assignee.id}
                className="rounded-md hover:bg-muted/50"
              >
                <div className="group flex items-center gap-2.5 px-2 py-1.5">
                  <UserAvatar
                    avatarUrl={assignee.avatar}
                    initials={initials}
                    colorSeed={assignee.userId ?? assignee.id}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{assignee.name}</div>
                    {(role || !assignee.isActive) && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {role ?? (!assignee.isActive ? t`Disabled` : null)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100">
                    {hasContact && (
                      <button
                        type="button"
                        onClick={(event) => openPopup(event, member)}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm"
                        aria-label={t`Show contact info`}
                      >
                        {assignee.email ? (
                          <Mail className="h-3.5 w-3.5" />
                        ) : (
                          <Phone className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => (isEditing ? cancelEdit() : beginEdit(assignee))}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm"
                        aria-label={t`Edit contact info`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEdit && memberRowId && (
                      <button
                        type="button"
                        onClick={() => void onRemoveMember(memberRowId)}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive hover:shadow-sm"
                        aria-label={t`Remove from team`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {isEditing && (
                  <div className="mx-2 mb-2 flex flex-col gap-1.5 rounded-lg bg-muted p-2.5">
                    <input
                      type="email"
                      placeholder="Email"
                      value={editingEmail}
                      onChange={(event) => setEditingEmail(event.target.value)}
                      className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder={t`Phone`}
                      value={editingPhone}
                      onChange={(event) => setEditingPhone(event.target.value)}
                      className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"
                    />
                    <div className="mt-0.5 flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={editingSubmitting}>
                        {t`Cancel`}
                      </Button>
                      <Button size="sm" onClick={() => void saveEdit(assignee.id)} disabled={editingSubmitting}>
                        {t`Save`}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!explicitMode && taskFallbackMembers.length > 0 && canEdit && availableForAdd.length > 0 && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              // Convenience: pin every task-derived assignee as a real member.
              void Promise.all(taskFallbackMembers.map((assignee) => onAddMember(assignee.id, null)));
            }}
          >
            {t`Pin all task assignees as members`}
          </Button>
        </div>
      )}

      {popup && (
        <ContactPopup
          contact={{
            name: popup.contact.assignee.name,
            role: popup.contact.role ?? (popup.contact.assignee.isActive ? null : t`Disabled`),
            email: popup.contact.assignee.email,
            phone: popup.contact.assignee.phone,
          }}
          anchorRect={popup.rect}
          onClose={() => setPopup(null)}
        />
      )}
    </section>
  );
};
