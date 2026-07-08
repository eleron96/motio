import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Mail, MoreHorizontal, Phone, Plus } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SearchInput } from '@/shared/ui/SearchInput';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import type { CustomerContact, Project } from '@/features/planner/types/planner';
import type { ContactEntry } from '@/features/projects/lib/contactList';
import { searchContactList } from '@/features/projects/lib/contactList';

interface ContactsPeoplePanelProps {
  /** People of the selected company (already filtered by the page). */
  entries: ContactEntry[];
  /** Header label: company name, or "All contacts" / "No company". */
  title: string;
  /** Pre-fills the company field of a new contact (null = "All"/"No company"). */
  defaultCompany: string | null;
  projectById: Map<string, Project>;
  canEdit: boolean;
  sectionPadding: string;
  onAddContact: (
    payload: { name: string; company: string | null; role: string | null; email: string | null; phone: string | null; tag: string | null; customerId: string | null },
  ) => Promise<boolean>;
  onUpdateContact: (id: string, updates: Partial<Omit<CustomerContact, 'id'>>) => Promise<boolean>;
  onDeleteContact: (id: string) => Promise<boolean>;
  onUpdateExternalPerson: (
    memberIds: string[],
    updates: { externalName: string; externalCompany: string | null; externalEmail: string | null; externalPhone: string | null; role: string | null; tag: string | null },
  ) => Promise<boolean>;
  onDeleteExternalPerson: (memberIds: string[]) => Promise<boolean>;
  onOpenProject: (project: Project) => void;
}

type Draft = { name: string; role: string; company: string; tag: string; email: string; phone: string };
const emptyDraft: Draft = { name: '', role: '', company: '', tag: '', email: '', phone: '' };

const buildInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '·';
};

export const ContactsPeoplePanel: React.FC<ContactsPeoplePanelProps> = ({
  entries,
  title,
  defaultCompany,
  projectById,
  canEdit,
  sectionPadding,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onUpdateExternalPerson,
  onDeleteExternalPerson,
  onOpenProject,
}) => {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<'new' | ContactEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactEntry | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);

  const visible = useMemo(() => searchContactList(entries, search), [entries, search]);

  useEffect(() => {
    if (form === null) return;
    if (form === 'new') {
      // Seed the company from the selected sidebar bucket (it groups by company).
      setDraft({ ...emptyDraft, company: defaultCompany ?? '' });
    } else {
      // Same fields for external members and customer contacts: entry.company
      // groups them, entry.tag is the chip.
      setDraft({ name: form.name, role: form.role ?? '', company: form.company ?? '', tag: form.tag ?? '', email: form.email ?? '', phone: form.phone ?? '' });
    }
  }, [form, defaultCompany]);

  const projectsOf = (entry: ContactEntry): Project[] => {
    if (entry.source.kind !== 'external') return [];
    const seen = new Set<string>();
    const list: Project[] = [];
    for (const projectId of entry.source.projectIds) {
      if (seen.has(projectId)) continue;
      seen.add(projectId);
      const project = projectById.get(projectId);
      if (project) list.push(project);
    }
    return list;
  };

  const submit = async () => {
    if (submitting || form === null) return;
    const name = draft.name.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const company = draft.company.trim() || null;
      const tag = draft.tag.trim() || null;
      let ok = false;
      if (form === 'new') {
        ok = await onAddContact({ name, company, role: draft.role.trim() || null, email: draft.email.trim() || null, phone: draft.phone.trim() || null, tag, customerId: null });
      } else if (form.source.kind === 'contact') {
        ok = await onUpdateContact(form.source.id, { name, company, role: draft.role.trim() || null, tag, email: draft.email.trim() || null, phone: draft.phone.trim() || null });
      } else {
        // External: company and tag are distinct columns — never merged.
        ok = await onUpdateExternalPerson(form.source.memberIds, {
          externalName: name, externalCompany: company, externalEmail: draft.email.trim() || null, externalPhone: draft.phone.trim() || null, role: draft.role.trim() || null, tag,
        });
      }
      if (ok) setForm(null);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || submitting) return;
    setSubmitting(true);
    try {
      const ok = deleteTarget.source.kind === 'contact'
        ? await onDeleteContact(deleteTarget.source.id)
        : await onDeleteExternalPerson(deleteTarget.source.memberIds);
      if (ok) setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDescription = (() => {
    if (!deleteTarget) return '';
    if (deleteTarget.source.kind === 'contact') return t`This removes "${deleteTarget.name}" from your contacts.`;
    const projects = projectsOf(deleteTarget);
    if (projects.length === 0) return t`This removes "${deleteTarget.name}" from every project they're on.`;
    const listed = projects.slice(0, 3).map((p) => formatProjectLabel(p.name, p.code)).join(', ');
    const names = projects.length > 3 ? `${listed}…` : listed;
    return projects.length > 1
      ? t`This removes "${deleteTarget.name}" from all ${projects.length} projects: ${names}.`
      : t`This removes "${deleteTarget.name}" from ${names}.`;
  })();

  const badge = (entry: ContactEntry): React.ReactNode => {
    if (entry.source.kind === 'contact') {
      return entry.source.customerName
        ? <Badge className="text-[10px]">{t`Client: ${entry.source.customerName}`}</Badge>
        : null;
    }
    const count = entry.source.projectIds.length;
    return <Badge variant="secondary" className="text-[10px]">{count > 1 ? t`External · ${count} projects` : t`External`}</Badge>;
  };

  const externalForm = form !== null && form !== 'new' && form.source.kind === 'external'
    ? (form as ContactEntry & { source: { kind: 'external'; memberIds: string[]; projectIds: string[] } })
    : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className={`border-b border-border ${sectionPadding}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">{title}</div>
            <div className="text-xs text-muted-foreground">{t`${entries.length} people`}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SearchInput
              className="w-[200px]"
              inputClassName="h-9"
              placeholder={t`Search people`}
              value={search}
              onValueChange={setSearch}
              clearLabel={t`Clear search`}
            />
            {canEdit && (
              <Button size="sm" className="gap-1" onClick={() => setForm('new')}>
                <Plus className="h-4 w-4" />
                {t`New contact`}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-auto ${sectionPadding}`}>
        {entries.length === 0 && <div className="text-sm text-muted-foreground">{t`No contacts here yet.`}</div>}
        {entries.length > 0 && visible.length === 0 && <div className="text-sm text-muted-foreground">{t`No contacts found.`}</div>}
        {visible.length > 0 && (
          <ul className="divide-y divide-border">
            {visible.map((entry) => {
              const projects = projectsOf(entry);
              return (
                <li key={entry.key} className="flex items-center gap-3 py-2">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                    {buildInitials(entry.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium break-words [overflow-wrap:anywhere]">{entry.name}</span>
                      {entry.tag && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{entry.tag}</Badge>
                      )}
                      {badge(entry)}
                    </div>
                    {(entry.role || entry.company) && (
                      <div className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                        {[entry.role, entry.company].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
                    {entry.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{entry.email}</span>}
                    {entry.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{entry.phone}</span>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={t`Contact actions`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem disabled={!canEdit} onSelect={() => setForm(entry)}>{t`Edit`}</DropdownMenuItem>
                      {projects.slice(0, 3).map((project) => (
                        <DropdownMenuItem key={project.id} onSelect={() => onOpenProject(project)}>
                          {t`Open ${formatProjectLabel(project.name, project.code)}`}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!canEdit}
                        onSelect={() => setDeleteTarget(entry)}
                        className="text-destructive focus:text-destructive"
                      >
                        {t`Delete`}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={form !== null} onOpenChange={(open) => { if (!open) setForm(null); }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{form === 'new' ? t`New contact` : t`Edit contact`}</DialogTitle>
            <DialogDescription className="sr-only">{t`A person you can reuse across projects.`}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <div className="flex flex-col gap-1.5">
              <Label>{t`Full name`}</Label>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t`Company`}</Label>
              <Input value={draft.company} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t`Role / job title`}</Label>
              <Input value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t`Tag`}</Label>
              <Input value={draft.tag} onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground">{t`For grouping, e.g. a project section: АР, КР, ВИС`}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t`Phone`}</Label>
              <Input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
            </div>
            {externalForm && externalForm.source.projectIds.length > 1 && (
              <p className="text-[11px] text-muted-foreground">
                {t`Changes apply everywhere this person appears (${externalForm.source.projectIds.length} projects).`}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={submitting}>{t`Cancel`}</Button>
              <Button type="submit" disabled={!draft.name.trim() || submitting}>{form === 'new' ? t`Add` : t`Save`}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete contact?`}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={submitting}
            >
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
