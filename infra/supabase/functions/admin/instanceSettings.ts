// Server settings (Admin → Settings): reading the table with a short cache, and
// the super admin's changes. How a value is decided is in
// ../_shared/instanceSettings.ts; the list is ../_shared/instanceSettingsRegistry.ts.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  instanceSettingValues,
  isInstanceSettingKey,
  resolveInstanceSettings,
  type InstanceSettingRow,
  type InstanceSettingValues,
  type ResolvedInstanceSetting,
} from "../_shared/instanceSettings.ts";
import { getProfileMap } from "../_shared/supabaseAuth.ts";

// whoami asks on every visit: keep the answer for a while. A change from the
// admin console clears it; one from the command line shows within this time.
const CACHE_MS = 30_000;
let cache: { at: number; resolved: ResolvedInstanceSetting[] } | null = null;

const readEnv = (name: string) => Deno.env.get(name);

const log = (level: "info" | "warn", entry: Record<string, unknown>) => {
  const line = JSON.stringify({ module: "admin.settings", ...entry });
  if (level === "warn") console.warn(line); else console.info(line);
};

// Never throws and never blocks anyone: when the table cannot be read (not
// migrated yet, database busy), every setting is its default — Motio as before.
export const loadInstanceSettings = async (
  supabaseAdmin: SupabaseClient,
  options: { fresh?: boolean } = {},
): Promise<ResolvedInstanceSetting[]> => {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.resolved;
  try {
    const { data, error } = await supabaseAdmin
      .from("instance_settings")
      .select("key, value, updated_at, updated_by");
    if (error) throw new Error(error.message);
    const resolved = resolveInstanceSettings((data ?? []) as InstanceSettingRow[], readEnv);
    cache = { at: Date.now(), resolved };
    return resolved;
  } catch (error) {
    log("warn", {
      action: "load",
      result: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    return resolveInstanceSettings([], readEnv);
  }
};

export const loadInstanceSettingValues = async (supabaseAdmin: SupabaseClient): Promise<InstanceSettingValues> => (
  instanceSettingValues(await loadInstanceSettings(supabaseAdmin))
);

export const listInstanceSettingsForAdmin = async (supabaseAdmin: SupabaseClient) => {
  const resolved = await loadInstanceSettings(supabaseAdmin, { fresh: true });
  const changedBy = resolved
    .map((setting) => setting.updatedBy)
    .filter((id): id is string => Boolean(id));
  // Names are a nicety: without them the console still shows the date.
  const profileResult = await getProfileMap(supabaseAdmin, changedBy).catch(() => null);
  const profiles = profileResult && "profiles" in profileResult ? profileResult.profiles : null;
  return resolved.map((setting) => {
    const profile = setting.updatedBy && profiles ? profiles.get(setting.updatedBy) : null;
    return {
      ...setting,
      updatedByName: profile ? (profile.displayName || profile.email || null) : null,
    };
  });
};

// value null = back to the default (the row goes away).
export const updateInstanceSetting = async (
  supabaseAdmin: SupabaseClient,
  input: { key: string; value: boolean | null; actorId: string },
): Promise<{ ok: true } | { error: string; status: number }> => {
  if (!isInstanceSettingKey(input.key)) return { error: "Unknown setting.", status: 400 };

  const current = (await loadInstanceSettings(supabaseAdmin, { fresh: true }))
    .find((setting) => setting.key === input.key);
  if (current?.source === "env") {
    return { error: `${current.env}=true in .env decides this setting; change it there.`, status: 409 };
  }

  const { error } = input.value === null
    ? await supabaseAdmin.from("instance_settings").delete().eq("key", input.key)
    : await supabaseAdmin.from("instance_settings").upsert({
      key: input.key,
      value: input.value,
      updated_at: new Date().toISOString(),
      updated_by: input.actorId,
    });
  cache = null;
  if (error) {
    log("warn", { action: "update", entityId: input.key, result: "error", message: error.message });
    return { error: error.message, status: 500 };
  }
  log("info", { action: "update", entityId: input.key, value: input.value, result: "success" });
  return { ok: true };
};
