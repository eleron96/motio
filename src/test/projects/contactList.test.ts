import { describe, expect, it } from 'vitest';

import {
  ALL_COMPANIES,
  NO_COMPANY,
  buildCompanyBuckets,
  buildContactList,
  filterEntriesByCompany,
  searchContactList,
} from '@/features/projects/lib/contactList';
import type { Customer, CustomerContact, ProjectMember } from '@/features/planner/types/planner';

const contact = (over: Partial<CustomerContact>): CustomerContact => ({
  id: over.id ?? 'c1',
  customerId: over.customerId === undefined ? 'cust1' : over.customerId,
  name: over.name ?? 'Иван Петров',
  role: over.role ?? null,
  email: over.email ?? null,
  phone: over.phone ?? null,
  position: over.position ?? 0,
  company: over.company ?? null,
  tag: over.tag ?? null,
});

const member = (over: Partial<ProjectMember>): ProjectMember => ({
  id: over.id ?? 'm1',
  projectId: over.projectId ?? 'p1',
  assigneeId: over.assigneeId ?? null,
  role: over.role ?? null,
  position: over.position ?? 0,
  tag: over.tag ?? null,
  externalName: over.externalName ?? null,
  externalCompany: over.externalCompany ?? null,
  externalEmail: over.externalEmail ?? null,
  externalPhone: over.externalPhone ?? null,
});

const customersById = new Map<string, Customer>([
  ['cust1', { id: 'cust1', name: 'Blue Orbit', industry: null }],
]);

describe('buildContactList', () => {
  it('lists customer contacts with their client name, and standalone ones with null', () => {
    const entries = buildContactList([
      contact({ id: 'c1', name: 'Анна', customerId: 'cust1', company: 'ООО Ромашка', tag: 'ГИП' }),
      contact({ id: 'c2', name: 'Борис', customerId: null }),
    ], [], customersById);
    const anna = entries.find((e) => e.name === 'Анна')!;
    expect(anna.source).toMatchObject({ kind: 'contact', customerId: 'cust1', customerName: 'Blue Orbit' });
    expect(anna.company).toBe('ООО Ромашка'); // firm groups them
    expect(anna.tag).toBe('ГИП'); // free-form tag shown as a chip
    const boris = entries.find((e) => e.name === 'Борис')!;
    expect(boris.source).toMatchObject({ kind: 'contact', customerId: null, customerName: null });
  });

  it('keeps an external person company (firm) and tag (discipline) separate', () => {
    const entries = buildContactList([], [
      member({ id: 'm1', externalName: 'Екатерина', externalCompany: 'СПИЧ', tag: 'АР' }),
    ], customersById);
    expect(entries[0].company).toBe('СПИЧ'); // groups under the firm
    expect(entries[0].tag).toBe('АР'); // discipline shown as a chip
  });

  it('dedupes an external person across projects, keeping every member id', () => {
    const entries = buildContactList([], [
      member({ id: 'm1', projectId: 'p1', externalName: 'Игорь', externalCompany: 'СтройТех', externalEmail: 'i@s.ru' }),
      member({ id: 'm2', projectId: 'p2', externalName: 'Игорь', externalCompany: 'СтройТех', externalEmail: 'i@s.ru', role: 'прораб' }),
    ], customersById);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toEqual({ kind: 'external', memberIds: ['m1', 'm2'], projectIds: ['p1', 'p2'] });
    expect(entries[0].role).toBe('прораб'); // gap filled from later row
  });

  it('skips workspace members and empty names, sorts by name', () => {
    const entries = buildContactList(
      [contact({ id: 'c1', name: 'Яков' })],
      [
        member({ id: 'm1', assigneeId: 'a1', externalName: 'Игнор', externalCompany: 'X' }),
        member({ id: 'm2', externalName: '  ' }),
        member({ id: 'm3', externalName: 'Абрам', externalCompany: 'Y' }),
      ],
      customersById,
    );
    expect(entries.map((e) => e.name)).toEqual(['Абрам', 'Яков']);
  });
});

describe('company grouping', () => {
  const entries = buildContactList([
    contact({ id: 'c1', name: 'Анна', company: 'айбим' }),
    contact({ id: 'c2', name: 'Пётр', company: 'айбим' }),
    contact({ id: 'c3', name: 'Без', company: null }),
  ], [
    member({ id: 'm1', externalName: 'Игорь', externalCompany: 'СтройТех' }),
  ], customersById);

  it('buckets by company with counts, "no company" last', () => {
    const buckets = buildCompanyBuckets(entries);
    expect(buckets.map((b) => [b.company, b.count])).toEqual([
      ['айбим', 2],
      ['СтройТех', 1],
      [null, 1],
    ]);
    expect(buckets[2].key).toBe(NO_COMPANY);
  });

  it('filters entries by the selected bucket', () => {
    expect(filterEntriesByCompany(entries, ALL_COMPANIES)).toHaveLength(4);
    expect(filterEntriesByCompany(entries, 'айбим').map((e) => e.name).sort()).toEqual(['Анна', 'Пётр']);
    expect(filterEntriesByCompany(entries, NO_COMPANY).map((e) => e.name)).toEqual(['Без']);
  });
});

describe('searchContactList', () => {
  const entries = buildContactList([
    contact({ id: 'c1', name: 'Анна Смирнова', email: 'anna@stroy.ru', company: 'СтройГрупп' }),
    contact({ id: 'c2', name: 'Борис Иванов', email: 'boris@x.ru' }),
  ], [], customersById);

  it('empty query returns all', () => {
    expect(searchContactList(entries, '  ')).toHaveLength(2);
  });

  it('matches name, company, email case-insensitively', () => {
    expect(searchContactList(entries, 'анна').map((e) => e.name)).toEqual(['Анна Смирнова']);
    expect(searchContactList(entries, 'СТРОЙГ').map((e) => e.name)).toEqual(['Анна Смирнова']);
    expect(searchContactList(entries, 'boris@').map((e) => e.name)).toEqual(['Борис Иванов']);
  });
});
