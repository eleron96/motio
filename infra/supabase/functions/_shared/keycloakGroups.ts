// Keycloak groups, read-only: the groups a person is in, and all groups of the
// realm for the mapping form of the admin console (workspaces from groups).
import { keycloakRequest, parseKeycloakError, type KeycloakConfig } from "./keycloak.ts";

interface GroupRepresentation {
  id?: string;
  name?: string;
  path?: string;
  subGroupCount?: number;
}

// Enough for any company directory a self-hosted install mirrors; the form
// still accepts a group path typed by hand beyond it.
const MAX_GROUPS = 1000;
const PAGE = 200;

const realmPath = (config: KeycloakConfig) => `/admin/realms/${encodeURIComponent(config.realm)}`;

const readGroups = async (config: KeycloakConfig, path: string) => {
  const found: GroupRepresentation[] = [];
  for (let first = 0; first < MAX_GROUPS; first += PAGE) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await keycloakRequest(
      config,
      `${path}${separator}briefRepresentation=true&first=${first}&max=${PAGE}`,
      { method: "GET" },
    );
    if (!response.ok) {
      return { error: await parseKeycloakError(response) };
    }
    const page = await response.json() as GroupRepresentation[];
    found.push(...page);
    if (page.length < PAGE) break;
  }
  return { groups: found };
};

// Direct memberships, with their full paths ("/Company/Design").
export const getUserGroupPaths = async (config: KeycloakConfig, userId: string) => {
  const result = await readGroups(config, `${realmPath(config)}/users/${encodeURIComponent(userId)}/groups`);
  if ("error" in result) return { error: result.error };
  return { paths: result.groups.map((group) => group.path ?? "").filter(Boolean) };
};

// Every group of the realm, subgroups included, sorted by path.
export const listRealmGroupPaths = async (config: KeycloakConfig) => {
  const top = await readGroups(config, `${realmPath(config)}/groups`);
  if ("error" in top) return { error: top.error };

  const paths: string[] = [];
  const queue = [...top.groups];
  while (queue.length > 0 && paths.length < MAX_GROUPS) {
    const group = queue.shift()!;
    if (group.path) paths.push(group.path);
    if (group.id && (group.subGroupCount ?? 0) > 0) {
      const children = await readGroups(
        config,
        `${realmPath(config)}/groups/${encodeURIComponent(group.id)}/children`,
      );
      if ("error" in children) return { error: children.error };
      queue.push(...children.groups);
    }
  }
  return { paths: paths.sort((a, b) => a.localeCompare(b)), truncated: queue.length > 0 };
};
