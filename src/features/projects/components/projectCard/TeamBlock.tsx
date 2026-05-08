import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { ExternalLink, Group, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import type { Assignee, ProjectMember } from '@/features/planner/types/planner';
import { ContactPopup, type ContactPopupTarget } from './ContactPopup';
import { MobileContactSheet } from './MobileContactSheet';

const UNTAGGED_KEY = '__no_tag__';
const UNTAGGED_LABEL_PROVIDER = () => t`Untagged`;

interface TeamBlockProps {
  members: ProjectMember[];
  taskFallbackMembers: Assignee[];
  assigneesById: Map<string, Assignee>;
  workspaceAssignees: Assignee[];
  canEdit: boolean;
  /** Each handler resolves to `true` on success and `false` on failure. */
  onAddMember: (input: AddMemberInput) => Promise<boolean>;
  onRemoveMember: (memberId: string) => Promise<boolean>;
  onUpdateAssigneeContact: (assigneeId: string, email: string | null, phone: string | null) => Promise<boolean>;
  onUpdateExternalMember: (
    memberId: string,
    updates: Partial<Pick<ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ) => Promise<boolean>;
}

export type AddMemberInput =
  | { kind: 'workspace'; assigneeId: string; role: string | null; tag: string | null }
  | {
      kind: 'external';
      name: string;
      company: string | null;
      role: string | null;
      tag: string | null;
      email: string | null;
      phone: string | null;
    };

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
  /** When the row points at a workspace assignee. */
  assignee: Assignee | null;
  /** External label fields, valid when assignee is null. */
  external: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  role: string | null;
  tag: string | null;
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
  onUpdateExternalMember,
}) => {
  const isMobile = useIsMobile();
  // M1 mobile: read-only flow. Inline add / edit / remove for team members
  // are desktop-only until M3 introduces mobile sheet variants of those forms.
  const canEditMembers = canEdit && !isMobile;
  const [popup, setPopup] = useState<{ contact: ResolvedMember; rect: DOMRect } | null>(null);
  const [mobileSheetContact, setMobileSheetContact] = useState<ContactPopupTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [editingTag, setEditingTag] = useState('');
  const [editingSubmitting, setEditingSubmitting] = useState(false);

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

  const [groupByTag, setGroupByTag] = useState(false);
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  const explicitMode = members.length > 0;

  const resolvedMembers = useMemo<ResolvedMember[]>(() => {
    if (explicitMode) {
      return members
        .slice()
        .sort((a, b) => a.position - b.position)
        .map<ResolvedMember | null>((member) => {
          if (member.assigneeId) {
            const assignee = assigneesById.get(member.assigneeId);
            if (!assignee) return null;
            return { memberRowId: member.id, assignee, external: null, role: member.role, tag: member.tag };
          }
          if (member.externalName) {
            return {
              memberRowId: member.id,
              assignee: null,
              external: {
                name: member.externalName,
                company: member.externalCompany,
                email: member.externalEmail,
                phone: member.externalPhone,
              },
              role: member.role,
              tag: member.tag,
            };
          }
          return null;
        })
        .filter((value): value is ResolvedMember => value !== null);
    }
    return [...taskFallbackMembers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map<ResolvedMember>((assignee) => ({
        memberRowId: null,
        assignee,
        external: null,
        role: null,
        tag: null,
      }));
  }, [assigneesById, explicitMode, members, taskFallbackMembers]);

  const availableForAdd = useMemo(() => {
    const usedIds = new Set(members.map((m) => m.assigneeId).filter(Boolean));
    return workspaceAssignees
      .filter((a) => a.isActive && !usedIds.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, workspaceAssignees]);

  const groupedByTag = useMemo(() => {
    const groups = new Map<string, ResolvedMember[]>();
    for (const member of resolvedMembers) {
      const key = member.tag?.trim() ? member.tag.trim() : UNTAGGED_KEY;
      const list = groups.get(key) ?? [];
      list.push(member);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === UNTAGGED_KEY) return 1;
        if (b === UNTAGGED_KEY) return -1;
        return a.localeCompare(b);
      });
  }, [resolvedMembers]);

  const beginEdit = (member: ResolvedMember) => {
    setEditingId(member.memberRowId ?? member.assignee?.id ?? null);
    if (member.assignee) {
      setEditingEmail(member.assignee.email ?? '');
      setEditingPhone(member.assignee.phone ?? '');
    } else if (member.external) {
      setEditingEmail(member.external.email ?? '');
      setEditingPhone(member.external.phone ?? '');
    }
    setEditingTag(member.tag ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingEmail('');
    setEditingPhone('');
    setEditingTag('');
  };

  const saveEdit = async (member: ResolvedMember) => {
    if (editingSubmitting) return;
    setEditingSubmitting(true);
    try {
      const email = editingEmail.trim() || null;
      const phone = editingPhone.trim() || null;
      const tag = editingTag.trim() || null;
      let ok = true;
      if (member.assignee) {
        ok = await onUpdateAssigneeContact(member.assignee.id, email, phone);
        if (ok && member.memberRowId && tag !== member.tag) {
          ok = await onUpdateExternalMember(member.memberRowId, { tag });
        }
      } else if (member.external && member.memberRowId) {
        ok = await onUpdateExternalMember(member.memberRowId, {
          externalEmail: email,
          externalPhone: phone,
          tag,
        });
      }
      // Only close the editor when every write succeeded so the user keeps
      // their draft on failure.
      if (ok) cancelEdit();
    } finally {
      setEditingSubmitting(false);
    }
  };

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

  const resetAddForm = () => {
    setAddAssigneeId(null);
    setAddRole('');
    setAddTag('');
    setAddExternalName('');
    setAddExternalCompany('');
    setAddExternalEmail('');
    setAddExternalPhone('');
  };

  const toggleTagCollapsed = (key: string) => {
    setCollapsedTags((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderMemberRow = (member: ResolvedMember) => {
    const displayName = member.assignee?.name ?? member.external?.name ?? '—';
    const initials = buildInitials(displayName);
    const colorSeed = member.assignee?.userId ?? member.assignee?.id ?? member.external?.email ?? displayName;
    const hasContact = Boolean(
      (member.assignee && (member.assignee.email || member.assignee.phone))
        || (member.external && (member.external.email || member.external.phone)),
    );
    const isExternal = !member.assignee;
    const editingKey = member.memberRowId ?? member.assignee?.id ?? null;
    const isEditing = editingKey !== null && editingKey === editingId;

    return (
      <li key={member.memberRowId ?? member.assignee?.id ?? displayName} className="rounded-md hover:bg-muted/40">
        <div className="group flex items-center gap-2 px-1.5 py-1">
          <div className="relative h-6 w-6 flex-shrink-0">
            <div
              className="grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold text-white"
              style={{ background: getMonogramColor(colorSeed) }}
            >
              {initials}
            </div>
            {isExternal && (
              <span
                className="absolute -bottom-0.5 -right-0.5 grid h-3 w-3 place-items-center rounded-full border border-card bg-card text-[8px] text-muted-foreground"
                title={t`External (not in Motio)`}
              >
                <ExternalLink className="h-[8px] w-[8px]" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-medium leading-tight">{displayName}</span>
              {member.tag && (
                <span className="rounded-sm bg-muted px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {member.tag}
                </span>
              )}
            </div>
            {(member.role || member.external?.company || (member.assignee && !member.assignee.isActive)) && (
              <div className="truncate text-[10px] text-muted-foreground">
                {[
                  member.role,
                  member.external?.company,
                  member.assignee && !member.assignee.isActive ? t`Disabled` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100">
            {hasContact && (
              <button
                type="button"
                onClick={(e) => {
                  if (isMobile) {
                    setMobileSheetContact({
                      name: member.assignee?.name ?? member.external?.name ?? '—',
                      role: member.role
                        ?? member.external?.company
                        ?? (member.assignee?.isActive === false ? t`Disabled` : null),
                      email: member.assignee?.email ?? member.external?.email ?? null,
                      phone: member.assignee?.phone ?? member.external?.phone ?? null,
                    });
                    return;
                  }
                  setPopup({ contact: member, rect: e.currentTarget.getBoundingClientRect() });
                }}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm"
                aria-label={t`Show contact info`}
              >
                {(member.assignee?.email ?? member.external?.email) ? (
                  <Mail className="h-3 w-3" />
                ) : (
                  <Phone className="h-3 w-3" />
                )}
              </button>
            )}
            {canEditMembers && member.memberRowId && (
              <button
                type="button"
                onClick={() => (isEditing ? cancelEdit() : beginEdit(member))}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm"
                aria-label={t`Edit contact info`}
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {canEditMembers && member.memberRowId && (
              <button
                type="button"
                onClick={() => void onRemoveMember(member.memberRowId!)}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-card hover:text-destructive hover:shadow-sm"
                aria-label={t`Remove from team`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        {isEditing && (
          <div className="mx-1.5 mb-1.5 flex flex-col gap-1.5 rounded-md bg-muted p-2">
            <input
              type="email"
              placeholder="Email"
              value={editingEmail}
              onChange={(e) => setEditingEmail(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-[11px] outline-none focus:border-primary"
              autoFocus
            />
            <input
              type="text"
              placeholder={t`Phone`}
              value={editingPhone}
              onChange={(e) => setEditingPhone(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-[11px] outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder={t`Tag`}
              value={editingTag}
              onChange={(e) => setEditingTag(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-[11px] outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={editingSubmitting}>
                {t`Cancel`}
              </Button>
              <Button size="sm" onClick={() => void saveEdit(member)} disabled={editingSubmitting}>
                {t`Save`}
              </Button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Team`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {resolvedMembers.length}
        </span>
        <button
          type="button"
          onClick={() => setGroupByTag((v) => !v)}
          aria-pressed={groupByTag}
          title={t`Group by tag`}
          className={`ml-auto grid h-6 w-6 place-items-center rounded-md hover:bg-muted hover:text-foreground ${
            groupByTag ? 'bg-muted text-foreground' : 'text-muted-foreground'
          }`}
        >
          <Group className="h-3.5 w-3.5" />
        </button>
        {canEditMembers && (
          <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t`Add team member`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>{t`Add team member`}</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <div className="flex gap-1 rounded-md bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setAddKind('workspace')}
                    className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                      addKind === 'workspace' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    {t`Motio`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddKind('external')}
                    className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                      addKind === 'external' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    {t`External`}
                  </button>
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="flex flex-col gap-1.5 px-2 py-2">
                {addKind === 'workspace' ? (
                  <select
                    value={addAssigneeId ?? ''}
                    onChange={(e) => setAddAssigneeId(e.target.value || null)}
                    className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                  >
                    <option value="">{t`— pick member —`}</option>
                    {availableForAdd.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder={t`Full name`}
                      value={addExternalName}
                      onChange={(e) => setAddExternalName(e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder={t`Company`}
                      value={addExternalCompany}
                      onChange={(e) => setAddExternalCompany(e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                    />
                  </>
                )}
                <input
                  type="text"
                  placeholder={t`Role / job title`}
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
                <input
                  type="text"
                  placeholder={t`Tag (e.g. subcontractor)`}
                  value={addTag}
                  onChange={(e) => setAddTag(e.target.value)}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
                {addKind === 'external' && (
                  <>
                    <input
                      type="email"
                      placeholder="Email"
                      value={addExternalEmail}
                      onChange={(e) => setAddExternalEmail(e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      placeholder={t`Phone`}
                      value={addExternalPhone}
                      onChange={(e) => setAddExternalPhone(e.target.value)}
                      className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                    />
                  </>
                )}
                <div className="mt-1 flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => void submitAdd()}
                    disabled={
                      addSubmitting
                        || (addKind === 'workspace' ? !addAssigneeId : !addExternalName.trim())
                    }
                  >
                    {t`Add`}
                  </Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!explicitMode && resolvedMembers.length > 0 && (
        <div className="mb-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          {t`These members are derived from this project's tasks. Use + to pin them explicitly.`}
        </div>
      )}

      {resolvedMembers.length === 0 ? (
        <div className="text-ui-xs text-muted-foreground">
          {t`No team members yet. Use + to add one.`}
        </div>
      ) : groupByTag ? (
        <div className="flex flex-col gap-2">
          {groupedByTag.map(([key, list]) => {
            const label = key === UNTAGGED_KEY ? UNTAGGED_LABEL_PROVIDER() : key;
            const collapsed = collapsedTags.has(key);
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleTagCollapsed(key)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <span className="text-[8px]">{collapsed ? '▸' : '▾'}</span>
                  <span>{label}</span>
                  <span className="ml-auto text-muted-foreground/70">{list.length}</span>
                </button>
                {!collapsed && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {list.map(renderMemberRow)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {resolvedMembers.map(renderMemberRow)}
        </ul>
      )}

      {popup && (
        <ContactPopup
          contact={{
            name: popup.contact.assignee?.name ?? popup.contact.external?.name ?? '—',
            role: popup.contact.role
              ?? popup.contact.external?.company
              ?? (popup.contact.assignee?.isActive === false ? t`Disabled` : null),
            email: popup.contact.assignee?.email ?? popup.contact.external?.email ?? null,
            phone: popup.contact.assignee?.phone ?? popup.contact.external?.phone ?? null,
          }}
          anchorRect={popup.rect}
          onClose={() => setPopup(null)}
        />
      )}
      <MobileContactSheet
        contact={mobileSheetContact}
        onClose={() => setMobileSheetContact(null)}
      />
    </section>
  );
};
