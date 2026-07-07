import type { CustomerContact, ProjectMember } from '@/features/planner/types/planner';

/**
 * A person the user has entered somewhere before, collapsed across every place
 * they appear so they can be reused instead of retyped. Derived purely from
 * data already in the store (customer contacts + external project members) —
 * no new table, no migration. A workspace-wide directory built on top of this
 * is a later, opt-in step.
 */
export interface KnownPerson {
  name: string;
  role: string | null;
  /** «Компания/подрядчик» — from a customer contact's tag or an external member's company. */
  company: string | null;
  email: string | null;
  phone: string | null;
  /** How many source rows collapsed into this person. Higher = used more often. */
  usageCount: number;
}

interface RawPerson {
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}

const normalized = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

/**
 * Phone identity ignores formatting: keep digits and a leading `+` only, so
 * «+7 (999) 123-45-67» and «+79991234567» collapse to the same key. Matches the
 * normalization a future server-side directory key will use.
 */
const normalizedPhone = (value: string | null | undefined): string => (value ?? '').replace(/[^\d+]/g, '');

const cleaned = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Strict identity key: name + email + phone must all match for two rows to
 * collapse into one suggestion. Deliberately strict — merging on name or email
 * alone would fuse two different people who happen to share a name or a shared
 * `info@` mailbox, which is worse than showing a near-duplicate suggestion.
 */
export const personKey = (person: { name: string; email: string | null; phone: string | null }): string => (
  `${normalized(person.name)} ${normalized(person.email)} ${normalizedPhone(person.phone)}`
);

const dedupKey = (person: RawPerson): string => personKey(person);

/**
 * Collect the reusable people out of the workspace's customer contacts and
 * external project members. Workspace assignees are skipped: their identity is
 * owned by the Members page and they are already reusable everywhere.
 */
export const collectKnownPeople = (
  customerContacts: readonly CustomerContact[],
  projectMembers: readonly ProjectMember[],
): KnownPerson[] => {
  const raws: RawPerson[] = [];

  for (const contact of customerContacts) {
    const name = cleaned(contact.name);
    if (!name) continue;
    raws.push({
      name,
      role: cleaned(contact.role),
      company: cleaned(contact.tag),
      email: cleaned(contact.email),
      phone: cleaned(contact.phone),
    });
  }

  for (const member of projectMembers) {
    if (member.assigneeId) continue; // workspace member, not an external person
    const name = cleaned(member.externalName);
    if (!name) continue;
    raws.push({
      name,
      role: cleaned(member.role),
      company: cleaned(member.externalCompany) ?? cleaned(member.tag),
      email: cleaned(member.externalEmail),
      phone: cleaned(member.externalPhone),
    });
  }

  const byKey = new Map<string, KnownPerson>();
  for (const raw of raws) {
    const key = dedupKey(raw);
    const existing = byKey.get(key);
    if (existing) {
      existing.usageCount += 1;
      // Fill gaps from later rows so the merged suggestion is as complete as
      // possible, but never overwrite a value we already have.
      existing.role = existing.role ?? raw.role;
      existing.company = existing.company ?? raw.company;
      existing.email = existing.email ?? raw.email;
      existing.phone = existing.phone ?? raw.phone;
    } else {
      byKey.set(key, { ...raw, usageCount: 1 });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => (
    b.usageCount - a.usageCount || a.name.localeCompare(b.name)
  ));
};

/**
 * Filter known people by a free-text query over name / company / email,
 * preserving the ranking from `collectKnownPeople`. Empty query returns all.
 */
export const matchKnownPeople = (
  people: readonly KnownPerson[],
  query: string,
): KnownPerson[] => {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice();
  return people.filter((person) => (
    person.name.toLowerCase().includes(q)
    || (person.company?.toLowerCase().includes(q) ?? false)
    || (person.email?.toLowerCase().includes(q) ?? false)
  ));
};
