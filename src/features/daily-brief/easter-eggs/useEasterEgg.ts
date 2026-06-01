import type { ComponentType, LazyExoticComponent } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { EASTER_EGGS, EASTER_EGGS_ENABLED } from './registry';

/**
 * Returns the (lazily-loaded) easter-egg overlay component for the signed-in
 * user, or null. Matches by user id (auth.users.id), which is always present on
 * the session — unlike email, which can be empty under SSO. Returns null when
 * globally disabled, when there is no signed-in user, or when no enabled entry
 * matches — in which case the egg's chunk is never requested.
 */
export const useEasterEgg = (): LazyExoticComponent<ComponentType> | null => {
  const userId = useAuthStore((s) => s.user?.id);

  if (!EASTER_EGGS_ENABLED || !userId) return null;

  const egg = EASTER_EGGS.find((entry) => entry.enabled && entry.match === userId);

  return egg?.Component ?? null;
};
