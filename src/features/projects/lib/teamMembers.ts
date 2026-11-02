import type { Assignee, ProjectMember } from '@/features/planner/types/planner';

/** Group key of members without a company/contractor tag. */
export const UNTAGGED_KEY = '__no_tag__';

/** A team row: a workspace person or an external contact, with project-local role and tag. */
export interface ResolvedMember {
  /** project_members row id when explicit, null when only task-derived. */
  memberRowId: string | null;
  /** When the row points at a workspace assignee. */
  assignee: Assignee | null;
  /** External label fields, valid when assignee is null. */
  external: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  role: string | null;
  tag: string | null;
}

/**
 * The project team. With explicit project_members rows: those rows in their
 * order (rows pointing at an unknown person are skipped). Without any: everyone
 * assigned to the project's tasks, by name.
 */
export const resolveTeamMembers = (
  members: ProjectMember[],
  taskFallbackMembers: Assignee[],
  assigneesById: Map<string, Assignee>,
): ResolvedMember[] => {
  if (members.length > 0) {
    return members
      .slice()
      .sort((a, b) => a.position - b.position)
      .map<ResolvedMember | null>((member) => {
        if (member.assigneeId) {
          const assignee = assigneesById.get(member.assigneeId);
          if (!assignee) return null;
          return { memberRowId: member.id, assignee, external: null, role: member.role, tag: member.tag };
        }
        if (member.externalName) {
          return {
            memberRowId: member.id,
            assignee: null,
            external: {
              name: member.externalName,
              company: member.externalCompany,
              email: member.externalEmail,
              phone: member.externalPhone,
            },
            role: member.role,
            tag: member.tag,
          };
        }
        return null;
      })
      .filter((value): value is ResolvedMember => value !== null);
  }
  return [...taskFallbackMembers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<ResolvedMember>((assignee) => ({
      memberRowId: null,
      assignee,
      external: null,
      role: null,
      tag: null,
    }));
};

/** Active workspace people not yet on the team, by name. */
export const availableAssigneesForTeam = (members: ProjectMember[], workspaceAssignees: Assignee[]) => {
  const usedIds = new Set(members.map((m) => m.assigneeId).filter(Boolean));
  return workspaceAssignees
    .filter((a) => a.isActive && !usedIds.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Members grouped by tag, tags alphabetically, untagged last. */
export const groupTeamByTag = (resolvedMembers: ResolvedMember[]): Array<[string, ResolvedMember[]]> => {
  const groups = new Map<string, ResolvedMember[]>();
  for (const member of resolvedMembers) {
    const key = member.tag?.trim() ? member.tag.trim() : UNTAGGED_KEY;
    const list = groups.get(key) ?? [];
    list.push(member);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === UNTAGGED_KEY) return 1;
      if (b === UNTAGGED_KEY) return -1;
      return a.localeCompare(b);
    });
};

/** Initials for a monogram: first and last word, or "·" when there is no name. */
export const buildInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '·';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || first.toUpperCase() || '·';
};
