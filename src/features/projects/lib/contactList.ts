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
  /** The firm/organization used for grouping (external_company, or the tag as a fallback). */
  company: string | null;
  /** Free-form grouping tag (e.g. a discipline: АР/КР/ВИС). Shown as a chip. */
  tag: string | null;
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
    // Symmetric with external members (see below): the firm/company groups
    // them in the sidebar, the free-form tag (e.g. a discipline) is the chip.
    // Legacy rows predate the `company` column and stored their firm in `tag`
    // (the old form's single field) — fall back to it so they keep grouping,
    // and then suppress the redundant chip.
    const firm = cleaned(contact.company);
    const label = cleaned(contact.tag);
    entries.push({
      key: `contact-${contact.id}`,
      name: contact.name,
      role: cleaned(contact.role),
      company: firm ?? label,
      tag: firm ? label : null,
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
    // Firm groups the person; tag (discipline) is a separate chip. Fall back to
    // the tag for grouping only when there's no firm — then there's no chip.
    const firm = cleaned(member.externalCompany);
    const disc = cleaned(member.tag);
    const existing = byPerson.get(key);
    if (existing) {
      existing.role = existing.role ?? cleaned(member.role);
      existing.company = existing.company ?? firm ?? disc;
      existing.tag = existing.tag ?? (firm ? disc : null);
      existing.email = existing.email ?? email;
      existing.phone = existing.phone ?? phone;
      existing.source.memberIds.push(member.id);
      if (!existing.source.projectIds.includes(member.projectId)) existing.source.projectIds.push(member.projectId);
    } else {
      byPerson.set(key, {
        key: `external-${key}`,
        name,
        role: cleaned(member.role),
        company: firm ?? disc,
        tag: firm ? disc : null,
        email,
        phone,
        source: { kind: 'external', memberIds: [member.id], projectIds: [member.projectId] },
      });
    }
  }
  entries.push(...byPerson.values());

  return entries.sort((a, b) => a.name.localeCompare(b.name));
};

/** Filter the flat list by a free-text query over name / company / tag / role / email / phone. */
export const searchContactList = (entries: readonly ContactEntry[], rawQuery: string): ContactEntry[] => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return entries.slice();
  return entries.filter((entry) => (
    entry.name.toLowerCase().includes(query)
    || (entry.company?.toLowerCase().includes(query) ?? false)
    || (entry.tag?.toLowerCase().includes(query) ?? false)
    || (entry.role?.toLowerCase().includes(query) ?? false)
    || (entry.email?.toLowerCase().includes(query) ?? false)
    || (entry.phone?.toLowerCase().includes(query) ?? false)
  ));
};

// ── Company grouping (Contacts sidebar = companies, panel = their people) ──

/** Sentinel sidebar keys. */
export const ALL_COMPANIES = '__all__';
export const NO_COMPANY = '__no_company__';

/** Sidebar selection key for a company value (null → the "no company" bucket). */
export const companyKeyOf = (company: string | null): string => (
  company ? company.trim().toLowerCase() : NO_COMPANY
);

export interface CompanyBucket {
  key: string;
  /** Display name; null for the "no company" bucket. */
  company: string | null;
  count: number;
}

/** Distinct companies across the contact list, each with its people count. The
 *  "no company" bucket (people with no company) always sorts last. */
export const buildCompanyBuckets = (entries: readonly ContactEntry[]): CompanyBucket[] => {
  const byKey = new Map<string, CompanyBucket>();
  for (const entry of entries) {
    const company = entry.company;
    const key = companyKeyOf(company);
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { key, company, count: 1 });
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.company === null) return 1;
    if (b.company === null) return -1;
    return a.company.localeCompare(b.company);
  });
};

/** People of the selected sidebar bucket (ALL → everyone, NO_COMPANY → no company). */
export const filterEntriesByCompany = (entries: readonly ContactEntry[], companyKey: string): ContactEntry[] => {
  if (companyKey === ALL_COMPANIES) return entries.slice();
  return entries.filter((entry) => companyKeyOf(entry.company) === companyKey);
};

// ── Panel filters (tag / company / role) ──

/** Option key for entries with no value in the filtered field. */
export const NO_VALUE = '__none__';

export interface ContactFilterOption {
  key: string;
  /** Display label; null for the "no value" option. */
  label: string | null;
  count: number;
}

export interface ContactFilterSelection {
  companyKeys: string[];
  tagKeys: string[];
  roleKeys: string[];
}

export const EMPTY_CONTACT_FILTERS: ContactFilterSelection = {
  companyKeys: [],
  tagKeys: [],
  roleKeys: [],
};

const valueKeyOf = (value: string | null): string => (
  value ? value.trim().toLowerCase() : NO_VALUE
);

const collectFilterOptions = (
  entries: readonly ContactEntry[],
  pick: (entry: ContactEntry) => string | null,
): ContactFilterOption[] => {
  const byKey = new Map<string, ContactFilterOption>();
  for (const entry of entries) {
    const value = pick(entry);
    const key = valueKeyOf(value);
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    // The first spelling seen becomes the label (values dedupe case-insensitively).
    else byKey.set(key, { key, label: value, count: 1 });
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.label === null) return 1;
    if (b.label === null) return -1;
    return a.label.localeCompare(b.label);
  });
};

/** Distinct filter options across the directory; the "no value" option sorts last. */
export const buildContactFilterOptions = (entries: readonly ContactEntry[]) => ({
  companies: collectFilterOptions(entries, (entry) => entry.company),
  tags: collectFilterOptions(entries, (entry) => entry.tag),
  roles: collectFilterOptions(entries, (entry) => entry.role),
});

const matchesCategory = (keys: readonly string[], value: string | null): boolean => (
  keys.length === 0 || keys.includes(valueKeyOf(value))
);

/** AND across categories, OR within one; an empty category means "no filter". */
export const filterContactEntries = (
  entries: readonly ContactEntry[],
  selection: ContactFilterSelection,
): ContactEntry[] => entries.filter((entry) => (
  matchesCategory(selection.companyKeys, entry.company)
  && matchesCategory(selection.tagKeys, entry.tag)
  && matchesCategory(selection.roleKeys, entry.role)
));
