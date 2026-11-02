import { describe, expect, it } from 'vitest';
import type { Assignee, ProjectMember } from '@/features/planner/types/planner';
import {
  availableAssigneesForTeam,
  buildInitials,
  groupTeamByTag,
  resolveTeamMembers,
  UNTAGGED_KEY,
} from '@/features/projects/lib/teamMembers';

const person = (id: string, name: string, isActive = true): Assignee => ({
  id,
  name,
  isActive,
  email: null,
  phone: null,
});

const row = (overrides: Partial<ProjectMember>): ProjectMember => ({
  id: 'row',
  projectId: 'project-1',
  assigneeId: null,
  role: null,
  position: 0,
  tag: null,
  externalName: null,
  externalCompany: null,
  externalEmail: null,
  externalPhone: null,
  ...overrides,
} as ProjectMember);

const anna = person('anna', 'Anna');
const boris = person('boris', 'Boris');
const byId = new Map([[anna.id, anna], [boris.id, boris]]);

describe('team members', () => {
  it('uses the explicit rows in their order, skipping rows that point at nobody', () => {
    const team = resolveTeamMembers([
      row({ id: 'r2', assigneeId: 'boris', position: 2, tag: 'Sever' }),
      row({ id: 'r1', externalName: 'Olga', externalCompany: 'Sever', position: 1 }),
      row({ id: 'r3', assigneeId: 'gone', position: 3 }),
    ], [anna], byId);

    expect(team.map((member) => member.assignee?.name ?? member.external?.name)).toEqual(['Olga', 'Boris']);
    expect(team[1]).toMatchObject({ memberRowId: 'r2', tag: 'Sever' });
  });

  it('falls back to the people on the project tasks, by name, when there are no rows', () => {
    const team = resolveTeamMembers([], [boris, anna], byId);
    expect(team.map((member) => member.assignee?.id)).toEqual(['anna', 'boris']);
    expect(team.every((member) => member.memberRowId === null)).toBe(true);
  });

  it('groups by tag alphabetically with the untagged last', () => {
    const team = resolveTeamMembers([
      row({ id: 'a', assigneeId: 'anna', position: 1 }),
      row({ id: 'b', assigneeId: 'boris', position: 2, tag: ' Yug ' }),
      row({ id: 'c', externalName: 'Olga', position: 3, tag: 'Sever' }),
    ], [], byId);
    expect(groupTeamByTag(team).map(([key]) => key)).toEqual(['Sever', 'Yug', UNTAGGED_KEY]);
  });

  it('offers only active people who are not on the team yet', () => {
    const vera = person('vera', 'Vera', false);
    const available = availableAssigneesForTeam([row({ assigneeId: 'anna' })], [boris, anna, vera]);
    expect(available.map((assignee) => assignee.id)).toEqual(['boris']);
  });

  it('builds initials from the first and last word', () => {
    expect(buildInitials('anna maria petrova')).toBe('AP');
    expect(buildInitials('Olga')).toBe('O');
    expect(buildInitials('   ')).toBe('·');
  });
});
