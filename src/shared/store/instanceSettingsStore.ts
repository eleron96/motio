import { create } from 'zustand';
import { INSTANCE_SETTINGS } from '@/shared/contracts/instanceSettingsRegistry';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';

// Server settings the app needs (Admin → Settings; all off by default = Motio
// as before). whoami hands them over on every visit (authStore.resolveSuperAdmin).
// Until it answers, the last answer kept in this browser applies, so a page
// does not jump from one layout to another while loading; without one, the
// defaults. /demo always runs on the defaults.

type ClientSetting = Extract<(typeof INSTANCE_SETTINGS)[number], { client: true }>;
export type ClientInstanceSettingKey = ClientSetting['key'];
export type ClientInstanceSettingValues = Record<ClientInstanceSettingKey, boolean>;

const STORAGE_KEY = 'motio-instance-settings.v1';

const CLIENT_SETTINGS = INSTANCE_SETTINGS.filter((setting): setting is ClientSetting => setting.client);

const defaultValues = (): ClientInstanceSettingValues => (
  Object.fromEntries(CLIENT_SETTINGS.map((setting) => [setting.key, setting.default])) as ClientInstanceSettingValues
);

// Known keys with a true/false value only; anything else keeps its default.
export const sanitizeClientInstanceSettings = (raw: unknown): ClientInstanceSettingValues => {
  const values = defaultValues();
  if (!raw || typeof raw !== 'object') return values;
  const record = raw as Record<string, unknown>;
  for (const setting of CLIENT_SETTINGS) {
    const value = record[setting.key];
    if (typeof value === 'boolean') values[setting.key] = value;
  }
  return values;
};

const readCached = (): ClientInstanceSettingValues => {
  if (isDemoRoute()) return defaultValues();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeClientInstanceSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return defaultValues();
  }
};

const writeCached = (values: ClientInstanceSettingValues) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Private mode or full storage: the next visit simply starts from the defaults.
  }
};

type InstanceSettingsState = {
  values: ClientInstanceSettingValues;
  // whoami's `settings`; an answer without them (an older server) changes nothing.
  applyServerValues: (raw: unknown) => void;
};

export const useInstanceSettingsStore = create<InstanceSettingsState>((set, get) => ({
  values: readCached(),
  applyServerValues: (raw) => {
    if (raw === undefined || raw === null || isDemoRoute()) return;
    const next = sanitizeClientInstanceSettings(raw);
    const current = get().values;
    const changed = CLIENT_SETTINGS.some((setting) => current[setting.key] !== next[setting.key]);
    writeCached(next);
    if (changed) set({ values: next });
  },
}));

export const useInstanceSetting = (key: ClientInstanceSettingKey) => (
  useInstanceSettingsStore((state) => state.values[key])
);
