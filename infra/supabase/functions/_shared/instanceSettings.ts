// Server settings: how a value is decided, without any I/O (unit-tested in
// src/test/shared/instanceSettings.test.ts). The list and the defaults are in
// ./instanceSettingsRegistry.ts; reading the table is admin/instanceSettings.ts.
//
// Order: an older .env key set to "true" (locks the setting on) → the value a
// super admin stored → the default. A .env value of "false" or nothing locks
// nothing: `install.sh update` writes "=false" from .env.example into every
// install, and that must not take the switch away from the admin console.
import { INSTANCE_SETTINGS } from "./instanceSettingsRegistry.ts";

export type InstanceSettingKey = (typeof INSTANCE_SETTINGS)[number]["key"];
export type InstanceSettingSource = "default" | "admin" | "env";

export type InstanceSettingRow = {
  key: string;
  value: unknown;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type ResolvedInstanceSetting = {
  key: InstanceSettingKey;
  value: boolean;
  defaultValue: boolean;
  source: InstanceSettingSource;
  env: string | null;
  client: boolean;
  description: string;
  // Only when the stored value counts (source "admin").
  updatedAt: string | null;
  // null with source "admin" = changed from the command line.
  updatedBy: string | null;
};

export type InstanceSettingValues = Record<InstanceSettingKey, boolean>;

export const isInstanceSettingKey = (key: string): key is InstanceSettingKey => (
  INSTANCE_SETTINGS.some((setting) => setting.key === key)
);

export const isEnvSwitchOn = (value: string | undefined) => (value ?? "").trim().toLowerCase() === "true";

export const resolveInstanceSettings = (
  rows: InstanceSettingRow[],
  readEnv: (name: string) => string | undefined,
): ResolvedInstanceSetting[] => {
  const stored = new Map<string, InstanceSettingRow>();
  for (const row of rows) {
    // Only booleans exist for now; anything else (a hand-edited row) is ignored.
    if (typeof row.value === "boolean") stored.set(row.key, row);
  }

  return INSTANCE_SETTINGS.map((setting) => {
    const env: string | null = setting.env;
    const base = {
      key: setting.key,
      defaultValue: setting.default,
      env,
      client: setting.client,
      description: setting.description,
    };
    if (env && isEnvSwitchOn(readEnv(env))) {
      return { ...base, value: true, source: "env", updatedAt: null, updatedBy: null };
    }
    const row = stored.get(setting.key);
    if (row) {
      return {
        ...base,
        value: row.value as boolean,
        source: "admin",
        updatedAt: row.updated_at ?? null,
        updatedBy: row.updated_by ?? null,
      };
    }
    return { ...base, value: setting.default, source: "default", updatedAt: null, updatedBy: null };
  });
};

export const instanceSettingValues = (resolved: ResolvedInstanceSetting[]) => (
  Object.fromEntries(resolved.map((setting) => [setting.key, setting.value])) as InstanceSettingValues
);

// What whoami hands to every signed-in person: only what the app itself needs.
export const clientInstanceSettingValues = (resolved: ResolvedInstanceSetting[]) => (
  Object.fromEntries(
    resolved.filter((setting) => setting.client).map((setting) => [setting.key, setting.value]),
  ) as Partial<InstanceSettingValues>
);
