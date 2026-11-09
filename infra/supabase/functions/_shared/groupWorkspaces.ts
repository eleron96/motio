// Workspaces from Keycloak groups: the rules, without any I/O (unit-tested in
// src/test/shared/groupWorkspaces.test.ts). The admin function applies them
// when someone opens Motio (whoami) — see admin/groupWorkspaces.ts.

export const GROUP_WORKSPACE_ROLES = ["viewer", "editor", "admin"] as const;
export type GroupWorkspaceRole = (typeof GROUP_WORKSPACE_ROLES)[number];

const ROLE_RANK: Record<GroupWorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3 };

// A group as Keycloak shows its path: "/Design", "/Company/Design". Typed in by
// hand it may come without the leading slash or with a trailing one.
export const normalizeGroupPath = (value: string) => {
  const parts = value.trim().split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? `/${parts.join("/")}` : "";
};

// Keycloak passes the parent's roles down to subgroups; a mapping of a group
// covers its subgroups the same way: "/Company/Design" also counts as "/Company".
export const groupPathsWithParents = (paths: string[]) => {
  const result = new Set<string>();
  for (const path of paths) {
    const parts = normalizeGroupPath(path).split("/").filter(Boolean);
    for (let length = 1; length <= parts.length; length += 1) {
      result.add(`/${parts.slice(0, length).join("/")}`);
    }
  }
  return result;
};

export type GroupWorkspaceMapping = {
  groupPath: string;
  workspaceId: string;
  role: GroupWorkspaceRole;
};

export type GroupWorkspacePlan = {
  // Not a member yet: join with the highest role any of their groups gives.
  add: Array<{ workspaceId: string; role: GroupWorkspaceRole }>;
  // Only with role sync on (groups.syncRoles): memberships a group gave, whose
  // role nobody changed by hand since, move to the role their groups give now —
  // up or down.
  changeRole: Array<{ workspaceId: string; role: GroupWorkspaceRole; from: GroupWorkspaceRole }>;
  // Memberships a group gave whose role a workspace admin changed by hand: left
  // as they are, whatever the groups say (role sync on; for the log).
  manualRoles: string[];
  // Grants made before the role was recorded: write down the current role, so
  // that later changes can tell a group's role from a hand-made one.
  recordGrantRoles: Array<{ workspaceId: string; role: GroupWorkspaceRole }>;
  // Only with removal on: memberships the sync created, for a workspace none of
  // their groups maps to any more. Never the workspace they own.
  remove: string[];
  // Records of memberships that are gone (removed by hand) and no group wants
  // back: nothing left to take away later.
  forgetGrants: string[];
};

export const isGroupWorkspaceRole = (value: unknown): value is GroupWorkspaceRole => (
  typeof value === "string" && (GROUP_WORKSPACE_ROLES as readonly string[]).includes(value)
);

export const planGroupWorkspaceSync = (input: {
  groupPaths: string[];
  mappings: GroupWorkspaceMapping[];
  memberWorkspaceIds: string[];
  grantedWorkspaceIds: string[];
  ownedWorkspaceIds: string[];
  removeEnabled: boolean;
  // Role sync (groups.syncRoles), off by default: then the three fields below
  // change nothing and a member keeps their role, as before.
  syncRoles?: boolean;
  // The person's current role in each workspace they are in.
  memberRoles?: Record<string, string>;
  // The role each group-made membership was given (null: not recorded yet).
  grantedRoles?: Record<string, string | null>;
}): GroupWorkspacePlan => {
  const groups = groupPathsWithParents(input.groupPaths);
  const wanted = new Map<string, GroupWorkspaceRole>();
  for (const mapping of input.mappings) {
    if (!groups.has(normalizeGroupPath(mapping.groupPath))) continue;
    const current = wanted.get(mapping.workspaceId);
    if (!current || ROLE_RANK[mapping.role] > ROLE_RANK[current]) {
      wanted.set(mapping.workspaceId, mapping.role);
    }
  }

  const members = new Set(input.memberWorkspaceIds);
  const owned = new Set(input.ownedWorkspaceIds);

  // Existing access stays as it is: a member keeps their role, whatever the
  // group says. Sorted so the five-workspace limit always cuts the same ones.
  const add = [...wanted.entries()]
    .filter(([workspaceId]) => !members.has(workspaceId))
    .map(([workspaceId, role]) => ({ workspaceId, role }))
    .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));

  const remove = input.removeEnabled
    ? input.grantedWorkspaceIds
      .filter((workspaceId) => members.has(workspaceId) && !wanted.has(workspaceId) && !owned.has(workspaceId))
      .sort()
    : [];

  const forgetGrants = input.grantedWorkspaceIds
    .filter((workspaceId) => !members.has(workspaceId) && !wanted.has(workspaceId))
    .sort();

  const changeRole: GroupWorkspacePlan["changeRole"] = [];
  const manualRoles: string[] = [];
  const recordGrantRoles: GroupWorkspacePlan["recordGrantRoles"] = [];
  const removing = new Set(remove);
  for (const workspaceId of [...input.grantedWorkspaceIds].sort()) {
    if (!members.has(workspaceId) || owned.has(workspaceId) || removing.has(workspaceId)) continue;
    const current = input.memberRoles?.[workspaceId];
    if (!isGroupWorkspaceRole(current)) continue;
    const given = input.grantedRoles?.[workspaceId] ?? null;
    if (!isGroupWorkspaceRole(given)) {
      recordGrantRoles.push({ workspaceId, role: current });
      continue;
    }
    if (!input.syncRoles) continue;
    const target = wanted.get(workspaceId);
    // No group gives this workspace any more: that is removal's business.
    if (!target) continue;
    if (current !== given) {
      manualRoles.push(workspaceId);
      continue;
    }
    if (target !== current) changeRole.push({ workspaceId, role: target, from: current });
  }

  return { add, remove, forgetGrants, changeRole, manualRoles, recordGrantRoles };
};
