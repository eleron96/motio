// Server settings: the one list. A super admin flips them in Admin → Settings
// or with `install.sh settings` / `make settings`; the values live in the
// public.instance_settings table (0176), only those someone changed.
//
// Every default is how Motio works without the setting — on motio.nikog.net and
// on a fresh self-hosted install alike. Turning a setting off brings that back.
//
// The block between the markers is plain JSON: infra/scripts/motio-settings.sh
// reads it. This file exists twice, byte for byte —
// infra/supabase/functions/_shared/instanceSettingsRegistry.ts and
// src/shared/contracts/instanceSettingsRegistry.ts — because the edge runtime
// cannot import from src/ (src/test/shared/instanceSettingsRegistry.test.ts).
//
// Fields: key — "area.name"; default — boolean; client — the app needs it, so
// whoami hands it to every signed-in person; env — an older .env key that,
// set to true, turns the setting on and locks it (null = none); description —
// one line for the command line (the admin console has its own, translated).
//
// registry:begin
export const INSTANCE_SETTINGS = [
  {
    "key": "groups.workspaces",
    "default": false,
    "client": false,
    "env": "KEYCLOAK_WORKSPACES_FROM_GROUPS",
    "description": "Keycloak groups put people into workspaces (Admin -> Group access)"
  },
  {
    "key": "groups.removeOnLeave",
    "default": false,
    "client": false,
    "env": "KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE",
    "description": "Leaving a group also takes away the workspace access it gave"
  },
  {
    "key": "groups.syncRoles",
    "default": false,
    "client": false,
    "env": null,
    "description": "A group change also changes the role it gave (never a role set by hand)"
  },
  {
    "key": "groups.superAdmin",
    "default": false,
    "client": false,
    "env": "KEYCLOAK_SUPER_ADMIN_FROM_GROUPS",
    "description": "The super admin role may come from a Keycloak group"
  },
  {
    "key": "timeline.density",
    "default": false,
    "client": true,
    "env": null,
    "description": "Workspace admins can make the timeline denser (smaller photos, lower rows)"
  },
  {
    "key": "heatmap.personCapacity",
    "default": false,
    "client": true,
    "env": null,
    "description": "Workload heatmap: each person counts with their own share, 0-100 %"
  },
  {
    "key": "workspaces.closures",
    "default": false,
    "client": true,
    "env": null,
    "description": "Workspace admins can add days off for everyone (company closures)"
  },
  {
    "key": "dashboards.transfer",
    "default": false,
    "client": true,
    "env": null,
    "description": "Dashboards can be duplicated, exported to a file and imported"
  },
  {
    "key": "dashboards.calendarPeriods",
    "default": false,
    "client": true,
    "env": null,
    "description": "Dashboard widgets can show this or next calendar week or month"
  }
] as const;
// registry:end
