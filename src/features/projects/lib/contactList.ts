import type { Customer, CustomerContact, ProjectMember } from '@/features/planner/types/planner';
import { personKey } from './knownPeople';

/**
 * Flat directory for the Contacts tab. One list of every person entered
 * anywhere — customer contacts (incl. standalone ones with no client) and the
 * external members of project teams (deduped across projects). A pure
 * projection over data the store already loads.
 */

export interface ContactEntry {
  /** Stable list key. */
  key: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  source:
    | { kind: 'contact'; id: string; customerId: string | null; customerName: string | null }
    | { kind: 'external'; memberIds: string[]; projectIds: string[] };
}

const cleaned = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const buildContactList = (
  customerContacts: readonly CustomerContact[],
  projectMembers: readonly ProjectMember[],
  customersById: Map<string, Customer>,
): ContactEntry[] => {
  const entries: ContactEntry[] = [];

  for (const contact of customerContacts) {
    entries.push({
      key: `contact-${contact.id}`,
      name: contact.name,
      role: cleaned(contact.role),
      company: cleaned(contact.tag),
      email: cleaned(contact.email),
      phone: cleaned(contact.phone),
      source: {
        kind: 'contact',
        id: contact.id,
        customerId: contact.customerId,
        customerName: contact.customerId ? customersById.get(contact.customerId)?.name ?? null : null,
      },
    });
  }

  // External project members, deduped across projects by the strict person key.
  const byPerson = new Map<string, ContactEntry & { source: { kind: 'external'; memberIds: string[]; projectIds: string[] } }>();
  for (const member of projectMembers) {
    if (member.assigneeId) continue; // workspace member — lives on the Members page
    const name = cleaned(member.externalName);
    if (!name) continue;
    const email = cleaned(member.externalEmail);
    const phone = cleaned(member.externalPhone);
    const key = personKey({ name, email, phone });
    const existing = byPerson.get(key);
    if (existing) {
      existing.role = existing.role ?? cleaned(member.role);
      existing.company = existing.company ?? cleaned(member.externalCompany) ?? cleaned(member.tag);
      existing.email = existing.email ?? email;
      existing.phone = existing.phone ?? phone;
      existing.source.memberIds.push(member.id);
      if (!existing.source.projectIds.includes(member.projectId)) existing.source.projectIds.push(member.projectId);
    } else {
      byPerson.set(key, {
        key: `external-${key}`,
        name,
        role: cleaned(member.role),
        company: cleaned(member.externalCompany) ?? cleaned(member.tag),
        email,
        phone,
        source: { kind: 'external', memberIds: [member.id], projectIds: [member.projectId] },
      });
    }
  }
  entries.push(...byPerson.values());

  return entries.sort((a, b) => a.name.localeCompare(b.name));
};

/** Filter the flat list by a free-text query over name / company / email. */
export const searchContactList = (entries: readonly ContactEntry[], rawQuery: string): ContactEntry[] => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return entries.slice();
  return entries.filter((entry) => (
    entry.name.toLowerCase().includes(query)
    || (entry.company?.toLowerCase().includes(query) ?? false)
    || (entry.email?.toLowerCase().includes(query) ?? false)
  ));
};
