export const reserveAdminEmail = (import.meta.env.VITE_RESERVE_ADMIN_EMAIL ?? '')
  .trim()
  .toLowerCase();

let adminUserIdCache: string | null | undefined = undefined;
let adminUserIdInFlight: Promise<string | null> | null = null;

const parseProfileId = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = value as { id?: unknown };
    if (typeof candidate.id === 'string') return candidate.id;
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { id?: unknown } | unknown;
    if (first && typeof first === 'object' && typeof (first as { id?: unknown }).id === 'string') {
      return (first as { id: string }).id;
    }
  }
  return null;
};

export const getAdminUserId = async (): Promise<string | null> => {
  if (adminUserIdCache !== undefined) {
    return adminUserIdCache;
  }

  if (adminUserIdInFlight) {
    return adminUserIdInFlight;
  }

  if (!reserveAdminEmail) {
    adminUserIdCache = null;
    return null;
  }

  adminUserIdInFlight = (async () => {
    try {
      const { supabase } = await import('./supabaseClient');
      if (!supabase || typeof supabase?.from !== 'function') {
        adminUserIdCache = null;
        return null;
      }

      const rpcResult = await supabase.rpc('find_visible_profile_id_by_email', {
        p_email: reserveAdminEmail,
      });

      if (!rpcResult.error) {
        adminUserIdCache = parseProfileId(rpcResult.data);
        return adminUserIdCache;
      }

      const { data: adminProfile, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', reserveAdminEmail)
        .maybeSingle();

      if (error) {
        adminUserIdCache = null;
        return null;
      }

      adminUserIdCache = adminProfile?.id ?? null;
      return adminUserIdCache;
    } catch (_error) {
      adminUserIdCache = null;
      return null;
    } finally {
      adminUserIdInFlight = null;
    }
  })();

  return adminUserIdInFlight;
};
