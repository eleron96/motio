import { describe, expect, it } from 'vitest';

import { collectKnownPeople, matchKnownPeople } from '@/features/projects/lib/knownPeople';
import type { CustomerContact, ProjectMember } from '@/features/planner/types/planner';

const contact = (over: Partial<CustomerContact>): CustomerContact => ({
  id: over.id ?? 'c1',
  customerId: over.customerId ?? 'cust1',
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

describe('collectKnownPeople', () => {
  it('pulls people from customer contacts and external project members', () => {
    const people = collectKnownPeople(
      [contact({ id: 'c1', name: 'Анна', email: 'anna@a.ru', tag: 'АйБиМ' })],
      [member({ id: 'm1', externalName: 'Борис', externalCompany: 'СтройГрупп', externalPhone: '+7900' })],
    );
    expect(people).toHaveLength(2);
    const anna = people.find((p) => p.name === 'Анна');
    expect(anna).toMatchObject({ email: 'anna@a.ru', company: 'АйБиМ' });
    const boris = people.find((p) => p.name === 'Борис');
    expect(boris).toMatchObject({ company: 'СтройГрупп', phone: '+7900' });
  });

  it('carries the tag separately from the company so picking restores it', () => {
    // Екатерина: company (СПИЧ) + a distinct discipline tag (АР). Both must
    // survive so picking her fills the tag field, not just the company.
    const people = collectKnownPeople(
      [],
      [member({ id: 'm1', externalName: 'Екатерина', externalCompany: 'СПИЧ', tag: 'АР', role: 'Архитектор' })],
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ company: 'СПИЧ', tag: 'АР', role: 'Архитектор' });
  });

  it('does not duplicate a legacy firm-in-tag into both company and tag', () => {
    // Legacy row stored the firm in `tag` (no company column then): it becomes
    // the company for grouping, and the chip tag stays empty to avoid a dupe.
    const people = collectKnownPeople(
      [contact({ id: 'c1', name: 'Анна', tag: 'АйБиМ' })],
      [],
    );
    expect(people[0]).toMatchObject({ company: 'АйБиМ', tag: null });
  });

  it('fills a missing tag from a later row while merging', () => {
    // First row (no tag) sets the identity; a later row carries the tag. The
    // merged person keeps company from the first and tag from the second.
    const people = collectKnownPeople(
      [],
      [
        member({ id: 'm1', externalName: 'Екатерина', externalCompany: 'СПИЧ' }),
        member({ id: 'm2', externalName: 'Екатерина', externalCompany: 'СПИЧ', tag: 'АР' }),
      ],
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ company: 'СПИЧ', tag: 'АР', usageCount: 2 });
  });

  it('skips workspace assignees and rows without a name', () => {
    const people = collectKnownPeople(
      [contact({ id: 'c1', name: '   ' })],
      [
        member({ id: 'm1', assigneeId: 'a1', externalName: 'Ignored' }),
        member({ id: 'm2', externalName: '' }),
      ],
    );
    expect(people).toHaveLength(0);
  });

  it('collapses rows identical on name+email+phone, counting usages and filling gaps', () => {
    const people = collectKnownPeople(
      [
        contact({ id: 'c1', name: 'Иван Петров', email: 'ivan@x.ru' }),
        contact({ id: 'c2', name: 'иван петров', email: 'IVAN@x.ru', role: 'Прораб' }),
      ],
      [member({ id: 'm1', externalName: 'Иван Петров', externalEmail: 'ivan@x.ru', externalCompany: 'СтройГрупп' })],
    );
    expect(people).toHaveLength(1);
    // Gaps (role, company) fill in from later rows; name keeps its first-seen casing.
    expect(people[0]).toMatchObject({ name: 'Иван Петров', usageCount: 3, role: 'Прораб', company: 'СтройГрупп' });
  });

  it('collapses the same phone written with different formatting', () => {
    const people = collectKnownPeople(
      [
        contact({ id: 'c1', name: 'Пётр', phone: '+7 (999) 123-45-67' }),
        contact({ id: 'c2', name: 'Пётр', phone: '+79991234567' }),
      ],
      [],
    );
    expect(people).toHaveLength(1);
    expect(people[0].usageCount).toBe(2);
  });

  it('keeps a phone-bearing entry separate from a phoneless one (strict key)', () => {
    const people = collectKnownPeople(
      [
        contact({ id: 'c1', name: 'Иван Петров', email: 'ivan@x.ru' }),
        contact({ id: 'c2', name: 'Иван Петров', email: 'ivan@x.ru', phone: '+7 111' }),
      ],
      [],
    );
    expect(people).toHaveLength(2);
  });

  it('does NOT merge two different people who share an email', () => {
    const people = collectKnownPeople(
      [
        contact({ id: 'c1', name: 'Отдел продаж', email: 'info@co.ru' }),
        contact({ id: 'c2', name: 'Директор', email: 'info@co.ru' }),
      ],
      [],
    );
    expect(people).toHaveLength(2);
  });

  it('ranks by usage count, then name', () => {
    const people = collectKnownPeople(
      [
        contact({ id: 'c1', name: 'Редкий' }),
        contact({ id: 'c2', name: 'Частый', email: 'f@f.ru' }),
        contact({ id: 'c3', name: 'Частый', email: 'f@f.ru' }),
      ],
      [],
    );
    expect(people.map((p) => p.name)).toEqual(['Частый', 'Редкий']);
  });
});

describe('matchKnownPeople', () => {
  const people = collectKnownPeople(
    [
      contact({ id: 'c1', name: 'Анна Смирнова', email: 'anna@stroy.ru', tag: 'СтройГрупп' }),
      contact({ id: 'c2', name: 'Борис Иванов', email: 'boris@x.ru' }),
    ],
    [
      member({ id: 'm1', externalName: 'Вера Кузнецова', externalCompany: 'ПроектБюро', tag: 'КР', role: 'Конструктор' }),
    ],
  );

  it('returns everything for an empty query', () => {
    expect(matchKnownPeople(people, '  ')).toHaveLength(3);
  });

  it('matches on name, company, and email, case-insensitively', () => {
    expect(matchKnownPeople(people, 'анна').map((p) => p.name)).toEqual(['Анна Смирнова']);
    expect(matchKnownPeople(people, 'СТРОЙ').map((p) => p.name)).toEqual(['Анна Смирнова']);
    expect(matchKnownPeople(people, 'boris@').map((p) => p.name)).toEqual(['Борис Иванов']);
  });

  it('matches on the discipline tag and the role as well', () => {
    expect(matchKnownPeople(people, 'кр').map((p) => p.name)).toEqual(['Вера Кузнецова']);
    expect(matchKnownPeople(people, 'конструк').map((p) => p.name)).toEqual(['Вера Кузнецова']);
  });
});
