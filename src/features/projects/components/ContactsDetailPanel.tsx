import React, { useEffect, useState } from 'react';
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
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import type { CustomerContact, Project } from '@/features/planner/types/planner';
import type { ContactEntry } from '@/features/projects/lib/contactList';

interface ContactsDetailPanelProps {
  entry: ContactEntry | null;
  totalCount: number;
  projectById: Map<string, Project>;
  canEdit: boolean;
  sectionPadding: string;
  onAddContact: (
    payload: { name: string; role: string | null; email: string | null; phone: string | null; tag: string | null; customerId: string | null },
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

type Draft = { name: string; role: string; company: string; email: string; phone: string };
const emptyDraft: Draft = { name: '', role: '', company: '', email: '', phone: '' };

const buildInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '·';
};

export const ContactsDetailPanel: React.FC<ContactsDetailPanelProps> = ({
  entry,
  totalCount,
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
  // form: 'new' = add, ContactEntry = edit, null = closed.
  const [form, setForm] = useState<'new' | ContactEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactEntry | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (form === null) return;
    if (form === 'new') {
      setDraft(emptyDraft);
    } else {
      setDraft({
        name: form.name,
        role: form.role ?? '',
        company: form.company ?? '',
        email: form.email ?? '',
        phone: form.phone ?? '',
      });
    }
  }, [form]);

  const projectsOf = (target: ContactEntry): Project[] => {
    if (target.source.kind !== 'external') return [];
    const seen = new Set<string>();
    const list: Project[] = [];
    for (const projectId of target.source.projectIds) {
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
      let ok = false;
      if (form === 'new') {
        ok = await onAddContact({
          name,
          role: draft.role.trim() || null,
          email: draft.email.trim() || null,
          phone: draft.phone.trim() || null,
          tag: company,
          customerId: null,
        });
      } else if (form.source.kind === 'contact') {
        ok = await onUpdateContact(form.source.id, {
          name,
          role: draft.role.trim() || null,
          tag: company,
          email: draft.email.trim() || null,
          phone: draft.phone.trim() || null,
        });
      } else {
        ok = await onUpdateExternalPerson(form.source.memberIds, {
          externalName: name,
          externalCompany: company,
          externalEmail: draft.email.trim() || null,
          externalPhone: draft.phone.trim() || null,
          role: draft.role.trim() || null,
          tag: company,
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
    if (deleteTarget.source.kind === 'contact') {
      return t`This removes "${deleteTarget.name}" from your contacts.`;
    }
    const projects = projectsOf(deleteTarget);
    if (projects.length === 0) return t`This removes "${deleteTarget.name}" from every project they're on.`;
    const listed = projects.slice(0, 3).map((p) => formatProjectLabel(p.name, p.code)).join(', ');
    const names = projects.length > 3 ? `${listed}…` : listed;
    return projects.length > 1
      ? t`This removes "${deleteTarget.name}" from all ${projects.length} projects: ${names}.`
      : t`This removes "${deleteTarget.name}" from ${names}.`;
  })();

  const badge = (target: ContactEntry): React.ReactNode => {
    if (target.source.kind === 'contact') {
      return target.source.customerName
        ? <Badge className="text-[10px]">{t`Client: ${target.source.customerName}`}</Badge>
        : <Badge variant="outline" className="text-[10px] text-muted-foreground">{t`No client`}</Badge>;
    }
    const count = target.source.projectIds.length;
    return <Badge variant="secondary" className="text-[10px]">{count > 1 ? t`External · ${count} projects` : t`External`}</Badge>;
  };

  const isExternalForm = form !== null && form !== 'new' && form.source.kind === 'external';
  const externalForm = isExternalForm ? (form as ContactEntry & { source: { kind: 'external'; memberIds: string[]; projectIds: string[] } }) : null;
  const projects = entry ? projectsOf(entry) : [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className={`border-b border-border ${sectionPadding}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {entry ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">{entry.name}</div>
                  {badge(entry)}
                </div>
                {(entry.role || entry.company) && (
                  <div className="text-xs text-muted-foreground">{[entry.role, entry.company].filter(Boolean).join(' · ')}</div>
                )}
              </>
            ) : (
              <>
                <div className="text-lg font-semibold">{t`Contacts`}</div>
                <div className="text-xs text-muted-foreground">{t`${totalCount} people`}</div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {entry && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t`Contact actions`} disabled={!canEdit}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
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
            )}
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
        {!entry && (
          <div className="text-sm text-muted-foreground">{t`Choose a contact on the left, or add a new one.`}</div>
        )}
        {entry && (
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-full bg-muted text-base font-semibold text-muted-foreground">
              {buildInitials(entry.name)}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <dl className="space-y-2 text-sm">
                {entry.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${entry.email}`} className="text-primary hover:underline break-all">{entry.email}</a>
                  </div>
                )}
                {entry.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{entry.phone}</span>
                  </div>
                )}
                {!entry.email && !entry.phone && (
                  <div className="text-muted-foreground">{t`No contact details yet.`}</div>
                )}
              </dl>
              {projects.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`On projects`}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => onOpenProject(project)}
                        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted/40"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="max-w-[200px] truncate">{formatProjectLabel(project.name, project.code)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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
              <Label>{t`Role / job title`}</Label>
              <Input value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t`Company / contractor`}</Label>
              <Input value={draft.company} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} />
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
