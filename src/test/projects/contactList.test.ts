import { describe, expect, it } from 'vitest';

import {
  ALL_COMPANIES,
  NO_COMPANY,
  NO_VALUE,
  buildCompanyBuckets,
  buildContactFilterOptions,
  buildContactList,
  filterContactEntries,
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

  it('groups a legacy contact (no company column) by its tag as the firm', () => {
    // Rows created before the `company` column stored the firm in `tag`; they
    // must still group under that firm, not collapse into "no company".
    const legacy = buildContactList([
      contact({ id: 'c1', name: 'Пётр', company: null, tag: 'СтройТех' }),
    ], [], customersById);
    expect(legacy[0].company).toBe('СтройТех'); // tag used as the firm fallback
    expect(legacy[0].tag).toBeNull(); // and not shown as a redundant chip
    expect(buildCompanyBuckets(legacy).map((b) => b.company)).toEqual(['СтройТех']);
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

  it('matches role, tag and phone too — the single search covers the whole card', () => {
    const rich = buildContactList([
      contact({ id: 'c3', name: 'Вера', role: 'ГАП', phone: '+7 900 111-22-33', company: 'МИГ', tag: 'АР' }),
    ], [], customersById);
    expect(searchContactList(rich, 'гап').map((e) => e.name)).toEqual(['Вера']);
    expect(searchContactList(rich, '111-22').map((e) => e.name)).toEqual(['Вера']);
    expect(searchContactList(rich, 'ар').map((e) => e.name)).toEqual(['Вера']);
  });
});

describe('contact filters (tag / company / role)', () => {
  // NB: a contact with a tag but no company stores the tag AS the company
  // (legacy-row fallback in buildContactList), so "tagged but companyless"
  // is not a reachable combination here.
  const entries = buildContactList([
    contact({ id: 'c1', name: 'Анна', company: 'СтройГрупп', tag: 'АР', role: 'ГИП' }),
    contact({ id: 'c2', name: 'Борис', company: 'стройгрупп', tag: null, role: 'Конструктор' }),
    contact({ id: 'c3', name: 'Вера', company: 'МИГ', tag: 'КР', role: null }),
    contact({ id: 'c4', name: 'Глеб', company: null, tag: null, role: null }),
  ], [], customersById);

  it('builds deduped options with counts; the "no value" option sorts last', () => {
    const options = buildContactFilterOptions(entries);
    // 'СтройГрупп' and 'стройгрупп' collapse case-insensitively into one option.
    expect(options.companies.map((o) => [o.label, o.count])).toEqual([
      ['МИГ', 1],
      ['СтройГрупп', 2],
      [null, 1],
    ]);
    expect(options.tags.map((o) => [o.label, o.count])).toEqual([
      ['АР', 1],
      ['КР', 1],
      [null, 2],
    ]);
    expect(options.roles.map((o) => o.label)).toEqual(['ГИП', 'Конструктор', null]);
  });

  it('empty selection keeps everything', () => {
    expect(filterContactEntries(entries, { companyKeys: [], tagKeys: [], roleKeys: [] })).toHaveLength(4);
  });

  it('ORs within a category and ANDs across categories', () => {
    expect(
      filterContactEntries(entries, { companyKeys: [], tagKeys: ['ар', 'кр'], roleKeys: [] })
        .map((e) => e.name),
    ).toEqual(['Анна', 'Вера']);
    expect(
      filterContactEntries(entries, { companyKeys: ['стройгрупп'], tagKeys: ['ар'], roleKeys: [] })
        .map((e) => e.name),
    ).toEqual(['Анна']);
  });

  it('matches missing values through the NO_VALUE sentinel', () => {
    expect(
      filterContactEntries(entries, { companyKeys: [NO_VALUE], tagKeys: [], roleKeys: [] })
        .map((e) => e.name),
    ).toEqual(['Глеб']);
    expect(
      filterContactEntries(entries, { companyKeys: [], tagKeys: [], roleKeys: [NO_VALUE] })
        .map((e) => e.name),
    ).toEqual(['Вера', 'Глеб']);
  });
});
