import type { ComponentType, LazyExoticComponent } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { EASTER_EGGS, EASTER_EGGS_ENABLED } from './registry';

/**
 * Returns the (lazily-loaded) easter-egg overlay component for the signed-in
 * user, or null. Matches by email (case-insensitive). Returns null when
 * globally disabled, when there is no signed-in user, or when no enabled entry
 * matches — in which case the egg's chunk is never requested.
 */
export const useEasterEgg = (): LazyExoticComponent<ComponentType> | null => {
  const email = useAuthStore((s) => s.user?.email);

  if (!EASTER_EGGS_ENABLED || !email) return null;

  const normalized = email.trim().toLowerCase();
  const egg = EASTER_EGGS.find((entry) => entry.enabled && entry.match === normalized);

  return egg?.Component ?? null;
};
