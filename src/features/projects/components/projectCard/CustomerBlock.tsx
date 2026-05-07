import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Building2, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import type { Customer, CustomerContact } from '@/features/planner/types/planner';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import { ContactPopup } from './ContactPopup';
import { AddContactForm } from './AddContactForm';

interface CustomerBlockProps {
  customer: Customer | null;
  contacts: CustomerContact[];
  accentColor: string;
  canEdit: boolean;
  onAddContact: (
    payload: { customerId: string; name: string; role: string | null; email: string | null; phone: string | null }
  ) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
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
  const [adding, setAdding] = useState(false);
  const [popup, setPopup] = useState<{ contact: CustomerContact; rect: DOMRect } | null>(null);

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

  const handleSave = async (form: { name: string; role: string; email: string; phone: string }) => {
    await onAddContact({
      customerId: customer.id,
      name: form.name,
      role: form.role || null,
      email: form.email || null,
      phone: form.phone || null,
    });
    setAdding(false);
  };

  const openPopup = (event: React.MouseEvent<HTMLButtonElement>, contact: CustomerContact) => {
    setPopup({ contact, rect: event.currentTarget.getBoundingClientRect() });
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5" style={accentVars}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Customer`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {contacts.length}
        </span>
        {canEdit && (
          <button
            type="button"
            className="ml-auto grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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

      {contacts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {buildInitials(contact.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{contact.name}</div>
                {contact.role && (
                  <div className="truncate text-[11px] text-muted-foreground">{contact.role}</div>
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100">
                {(contact.email || contact.phone) && (
                  <button
                    type="button"
                    onClick={(event) => openPopup(event, contact)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm"
                    aria-label={t`Show contact info`}
                  >
                    {contact.email ? (
                      <Mail className="h-3.5 w-3.5" />
                    ) : (
                      <Phone className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void onDeleteContact(contact.id)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive hover:shadow-sm"
                    aria-label={t`Remove contact`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {popup && (
        <ContactPopup
          contact={popup.contact}
          anchorRect={popup.rect}
          onClose={() => setPopup(null)}
        />
      )}
    </section>
  );
};
