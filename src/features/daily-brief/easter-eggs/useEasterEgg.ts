import type { ComponentType, LazyExoticComponent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/authStore';
import { getSupabase } from '@/shared/lib/supabaseClient';
import { EASTER_EGGS_ENABLED, EGG_CATALOG, type EggKey, isEggKey } from './catalog';

/** Hard cap so a hung RPC can never delay or block the brief. */
const RPC_TIMEOUT_MS = 4000;
const TWELVE_HOURS_MS = 1000 * 60 * 60 * 12;

/**
 * Asks the DB which easter egg (if any) the signed-in user should see. Returns a
 * known catalog key or null. Best-effort by design: any failure — RPC error,
 * timeout, missing/unknown key — resolves to null so the daily brief is never
 * affected. The RPC filters on auth.uid() server-side and takes no argument, so
 * it only ever returns the caller's own assignment.
 */
export const resolveEggKey = async (): Promise<EggKey | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const { data, error } = await getSupabase()
      .rpc('get_my_daily_brief_egg')
      .abortSignal(controller.signal);
    if (error) return null;
    return isEggKey(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Returns the lazily-loaded easter-egg overlay component for the signed-in user,
 * or null. The RPC only fires once the brief is open (`active`) — never on the
 * brief's open/close decision path — and its result is cached for the day. The
 * egg's chunk is requested only when a known key comes back.
 */
export const useEasterEgg = (
  active: boolean,
): LazyExoticComponent<ComponentType> | null => {
  const userId = useAuthStore((s) => s.user?.id);
  const enabled = EASTER_EGGS_ENABLED && active && !!userId;

  const { data: key } = useQuery({
    queryKey: ['daily-brief-egg', userId],
    queryFn: resolveEggKey,
    enabled,
    staleTime: TWELVE_HOURS_MS,
    gcTime: TWELVE_HOURS_MS,
    retry: false,
  });

  return isEggKey(key) ? EGG_CATALOG[key] : null;
};
