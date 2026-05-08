import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Building2, Group, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import type { Customer, CustomerContact } from '@/features/planner/types/planner';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { ContactPopup } from './ContactPopup';
import { MobileContactSheet } from './MobileContactSheet';
import { AddContactForm } from './AddContactForm';

const UNTAGGED_KEY = '__no_tag__';

interface CustomerBlockProps {
  customer: Customer | null;
  contacts: CustomerContact[];
  accentColor: string;
  canEdit: boolean;
  /** Each handler resolves to `true` on success and `false` on failure. */
  onAddContact: (
    payload: { customerId: string; name: string; role: string | null; email: string | null; phone: string | null; tag: string | null }
  ) => Promise<boolean>;
  onDeleteContact: (id: string) => Promise<boolean>;
}

const buildInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '·';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || first.toUpperCase() || '·';
};

export const CustomerBlock: React.FC<CustomerBlockProps> = ({
  customer,
  contacts,
  accentColor,
  canEdit,
  onAddContact,
  onDeleteContact,
}) => {
  const isMobile = useIsMobile();
  // M1 mobile: read-only flow. Add/remove of contacts is desktop-only until M4.
  const canEditContacts = canEdit && !isMobile;
  const [adding, setAdding] = useState(false);
  const [popup, setPopup] = useState<{ contact: CustomerContact; rect: DOMRect } | null>(null);
  const [mobileSheetContact, setMobileSheetContact] = useState<CustomerContact | null>(null);
  const [groupByTag, setGroupByTag] = useState(false);
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  const groupedContacts = useMemo(() => {
    const groups = new Map<string, CustomerContact[]>();
    for (const contact of contacts) {
      const key = contact.tag?.trim() ? contact.tag.trim() : UNTAGGED_KEY;
      const list = groups.get(key) ?? [];
      list.push(contact);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNTAGGED_KEY) return 1;
      if (b === UNTAGGED_KEY) return -1;
      return a.localeCompare(b);
    });
  }, [contacts]);

  const toggleTagCollapsed = (key: string) => {
    setCollapsedTags((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!customer) {
    return (
      <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-ui-sm font-semibold">{t`Customer`}</h3>
        </div>
        <div className="text-ui-xs text-muted-foreground">
          {t`No customer assigned to this project.`}
        </div>
      </section>
    );
  }

  const accentVars = buildProjectAccentVars(accentColor);

  const handleSave = async (form: { name: string; role: string; email: string; phone: string; tag: string }) => {
    const ok = await onAddContact({
      customerId: customer.id,
      name: form.name,
      role: form.role || null,
      email: form.email || null,
      phone: form.phone || null,
      tag: form.tag || null,
    });
    if (ok) setAdding(false);
    return ok;
  };

  const openPopup = (event: React.MouseEvent<HTMLButtonElement>, contact: CustomerContact) => {
    if (isMobile) {
      setMobileSheetContact(contact);
      return;
    }
    setPopup({ contact, rect: event.currentTarget.getBoundingClientRect() });
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5" style={accentVars}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Customer`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {contacts.length}
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
        {canEditContacts && (
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setAdding((value) => !value)}
            aria-label={t`Add customer contact`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded-xl"
          style={{ background: 'var(--project-accent-soft)', color: 'var(--project-accent)' }}
        >
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-ui-sm font-semibold">{customer.name}</div>
          {customer.industry && (
            <div className="truncate text-[12px] text-muted-foreground">{customer.industry}</div>
          )}
        </div>
      </div>

      {adding && (
        <AddContactForm onSave={handleSave} onCancel={() => setAdding(false)} />
      )}

      {contacts.length === 0 && !adding && (
        <div className="rounded-md bg-muted/50 px-3 py-3 text-[12px] text-muted-foreground">
          {t`No customer contacts yet. Use + to add one.`}
        </div>
      )}

      {contacts.length > 0 && !groupByTag && (
        <ul className="flex flex-col gap-1">
          {contacts.map((contact) => renderContactRow(contact))}
        </ul>
      )}

      {contacts.length > 0 && groupByTag && (
        <div className="flex flex-col gap-2">
          {groupedContacts.map(([key, list]) => {
            const label = key === UNTAGGED_KEY ? t`Untagged` : key;
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
                    {list.map((contact) => renderContactRow(contact))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {popup && (
        <ContactPopup
          contact={popup.contact}
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

  function renderContactRow(contact: CustomerContact) {
    return (
      <li
        key={contact.id}
        className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/40"
      >
        <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
          {buildInitials(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium leading-tight">{contact.name}</span>
            {contact.tag && (
              <span className="rounded-sm bg-muted px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {contact.tag}
              </span>
            )}
          </div>
          {contact.role && (
            <div className="truncate text-[10px] text-muted-foreground">{contact.role}</div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100">
          {(contact.email || contact.phone) && (
            <button
              type="button"
              onClick={(event) => openPopup(event, contact)}
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm"
              aria-label={t`Show contact info`}
            >
              {contact.email ? (
                <Mail className="h-3 w-3" />
              ) : (
                <Phone className="h-3 w-3" />
              )}
            </button>
          )}
          {canEditContacts && (
            <button
              type="button"
              onClick={() => void onDeleteContact(contact.id)}
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-card hover:text-destructive hover:shadow-sm"
              aria-label={t`Remove contact`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </li>
    );
  }
};
