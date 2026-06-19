import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACCENT_ID,
  getAccentColorId,
  getAccentSwatch,
  isValidAccentId,
} from '@/shared/lib/accentColor';

describe('accentColor preference', () => {
  it('returns a stored valid accent id', () => {
    expect(getAccentColorId({ accent_color: 'sky' })).toBe('sky');
  });

  it('falls back to the default when the preference is missing', () => {
    expect(getAccentColorId({})).toBe(DEFAULT_ACCENT_ID);
    expect(getAccentColorId(null)).toBe(DEFAULT_ACCENT_ID);
    expect(getAccentColorId(undefined)).toBe(DEFAULT_ACCENT_ID);
  });

  it('falls back to the default for an unknown id', () => {
    expect(getAccentColorId({ accent_color: 'chartreuse' })).toBe(DEFAULT_ACCENT_ID);
    expect(getAccentColorId({ accent_color: 42 })).toBe(DEFAULT_ACCENT_ID);
  });

  it('validates accent ids against the palette', () => {
    expect(isValidAccentId('terracotta')).toBe(true);
    expect(isValidAccentId('lavender')).toBe(true);
    expect(isValidAccentId('nope')).toBe(false);
    expect(isValidAccentId(null)).toBe(false);
  });

  it('resolves a swatch for every palette id and defaults otherwise', () => {
    expect(getAccentSwatch('sky').id).toBe('sky');
    expect(getAccentSwatch('does-not-exist').id).toBe(DEFAULT_ACCENT_ID);
  });
});
