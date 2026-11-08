// Workspaces from Keycloak groups: the rules, without any I/O (unit-tested in
// src/test/shared/groupWorkspaces.test.ts). The admin function applies them
// when someone opens Motio (whoami) — see admin/groupWorkspaces.ts.

export const GROUP_WORKSPACE_ROLES = ["viewer", "editor", "admin"] as const;
export type GroupWorkspaceRole = (typeof GROUP_WORKSPACE_ROLES)[number];

const ROLE_RANK: Record<GroupWorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3 };

// KEYCLOAK_WORKSPACES_FROM_GROUPS / KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE.
export const isSettingOn = (value: string | undefined) => (value ?? "").trim().toLowerCase() === "true";

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
  // Only with removal on: memberships the sync created, for a workspace none of
  // their groups maps to any more. Never the workspace they own.
  remove: string[];
  // Records of memberships that are gone (removed by hand) and no group wants
  // back: nothing left to take away later.
  forgetGrants: string[];
};

export const planGroupWorkspaceSync = (input: {
  groupPaths: string[];
  mappings: GroupWorkspaceMapping[];
  memberWorkspaceIds: string[];
  grantedWorkspaceIds: string[];
  ownedWorkspaceIds: string[];
  removeEnabled: boolean;
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

  return { add, remove, forgetGrants };
};
