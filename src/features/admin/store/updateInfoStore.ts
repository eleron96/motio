import { create } from 'zustand';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { UpdateInfo } from '@/features/admin/lib/updateInfo';

// Admin console: is a newer release out. Asked once when the console opens
// (the server keeps GitHub's answer for six hours) and shared by the menu, the
// overview and the System section; "Refresh" there asks again.

type UpdateInfoState = {
  info: UpdateInfo | null;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
};

export const useUpdateInfoStore = create<UpdateInfoState>((set, get) => ({
  info: null,
  loading: false,
  loaded: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data, error } = await invokeAdminFunction<{ update?: UpdateInfo }>({
      action: ADMIN_ACTIONS.SYSTEM_VERSION,
    });
    // A failed answer keeps what was known: the mark must not blink on a blip.
    if (error || !data?.update) {
      set({ loading: false, loaded: true });
      return;
    }
    set({ loading: false, loaded: true, info: data.update });
  },
}));
