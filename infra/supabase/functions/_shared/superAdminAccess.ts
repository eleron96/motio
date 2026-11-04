export const SUPER_ADMIN_REALM_ROLE = "app_super_admin";

export type SuperAdminCacheAction = "add" | "remove" | "keep";

export type SuperAdminDecision = {
  allowed: boolean;
  cache: SuperAdminCacheAction;
};

// KEYCLOAK_SUPER_ADMIN_FROM_GROUPS=true lets a Keycloak group (or a composite
// role) grant super-admin access. Off by default: only a role assigned to the
// user directly counts.
export const isSuperAdminFromGroupsEnabled = (value: string | undefined) => (
  (value ?? "").trim().toLowerCase() === "true"
);

// The super_admins table mirrors the DIRECT role only. Role sync writes the
// table back to Keycloak as a direct role, so caching a group-granted role
// would make it stick after the user leaves the group.
export const decideSuperAdminAccess = (input: {
  directRoleNames: string[];
  effectiveRoleNames: string[];
  fromGroups: boolean;
  inTable: boolean;
}): SuperAdminDecision => {
  const direct = input.directRoleNames.includes(SUPER_ADMIN_REALM_ROLE);
  const viaGroup = input.fromGroups && input.effectiveRoleNames.includes(SUPER_ADMIN_REALM_ROLE);

  let cache: SuperAdminCacheAction = "keep";
  if (direct && !input.inTable) cache = "add";
  if (!direct && input.inTable) cache = "remove";

  return { allowed: direct || viaGroup, cache };
};
