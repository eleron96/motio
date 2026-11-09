import { create } from 'zustand';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';

// Admin console → Settings: server switches (instance_settings, 0176). The
// list and the defaults come from the server, which reads the registry
// (shared/contracts/instanceSettingsRegistry.ts).

export type ServerSettingSource = 'default' | 'admin' | 'env';

export type ServerSetting = {
  key: string;
  value: boolean;
  defaultValue: boolean;
  source: ServerSettingSource;
  env: string | null;
  client: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
};

type ServerSettingsState = {
  settings: ServerSetting[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  savingKey: string | null;
  load: () => Promise<void>;
  // value null = back to the default.
  update: (key: string, value: boolean | null) => Promise<{ error?: string }>;
};

// The super admin sees a change at once, not only at the next visit: the
// app-side copy (and the "Group access" menu entry) follow the answer.
const applyToApp = (settings: ServerSetting[]) => {
  useInstanceSettingsStore.getState().applyServerValues(
    Object.fromEntries(settings.filter((setting) => setting.client).map((setting) => [setting.key, setting.value])),
  );
  const groupWorkspaces = settings.find((setting) => setting.key === 'groups.workspaces');
  if (groupWorkspaces) useAuthStore.setState({ groupWorkspacesEnabled: groupWorkspaces.value });
};

export const useServerSettingsStore = create<ServerSettingsState>((set) => ({
  settings: [],
  loading: false,
  loaded: false,
  error: null,
  savingKey: null,
  load: async () => {
    set({ loading: true, error: null });
    const { data, error } = await invokeAdminFunction<{ settings?: ServerSetting[] }>({
      action: ADMIN_ACTIONS.SETTINGS_LIST,
    });
    if (error || !data?.settings) {
      set({ loading: false, loaded: true, error: error ?? 'No settings in the answer.' });
      return;
    }
    set({ loading: false, loaded: true, settings: data.settings });
  },
  update: async (key, value) => {
    set({ savingKey: key });
    const { data, error } = await invokeAdminFunction<{ settings?: ServerSetting[] }>({
      action: ADMIN_ACTIONS.SETTINGS_UPDATE,
      key,
      value,
    });
    if (error || !data?.settings) {
      set({ savingKey: null });
      return { error: error ?? 'No settings in the answer.' };
    }
    set({ savingKey: null, settings: data.settings });
    applyToApp(data.settings);
    return {};
  },
}));
