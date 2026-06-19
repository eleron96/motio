import { create } from 'zustand';
import {
  DEFAULT_ACCENT_ID,
  getAccentColorId,
  getAccentSwatch,
  isValidAccentId,
  type AccentSwatch,
} from '@/shared/lib/accentColor';
import { getStoredAccentId, setStoredAccentId } from '@/shared/lib/accentColorStorage';

// These CSS variables all encode the accent in src/app/index.css. Overriding
// them on :root recolors every bg-primary / ring / timeline-today / sidebar
// accent across the app from a single place.
const ACCENT_VARS = [
  '--primary',
  '--ring',
  '--timeline-today',
  '--sidebar-primary',
  '--sidebar-ring',
];

const applyAccent = (swatch: AccentSwatch) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (swatch.id === DEFAULT_ACCENT_ID) {
    // Drop the inline overrides so the stylesheet defaults apply (this also
    // keeps the dark-mode values intact instead of pinning a single colour).
    ACCENT_VARS.forEach((name) => root.style.removeProperty(name));
    return;
  }
  ACCENT_VARS.forEach((name) => root.style.setProperty(name, swatch.primary));
};

interface AccentColorState {
  accentId: string;
  setAccent: (id: string) => void;
  setAccentFromProfile: (preferences: Record<string, unknown> | null | undefined) => void;
}

// Apply the stored accent immediately at module load (mirrors localeStore), so
// the colour is right before React renders.
const initialAccentId = getStoredAccentId();
applyAccent(getAccentSwatch(initialAccentId));

export const useAccentColorStore = create<AccentColorState>((set, get) => ({
  accentId: initialAccentId,
  setAccent: (id) => {
    const nextId = isValidAccentId(id) ? id : DEFAULT_ACCENT_ID;
    applyAccent(getAccentSwatch(nextId));
    setStoredAccentId(nextId);
    if (get().accentId !== nextId) set({ accentId: nextId });
  },
  setAccentFromProfile: (preferences) => {
    const nextId = getAccentColorId(preferences);
    applyAccent(getAccentSwatch(nextId));
    setStoredAccentId(nextId);
    if (get().accentId !== nextId) set({ accentId: nextId });
  },
}));
