import { describe, expect, it } from 'vitest';
import { EGG_CATALOG, isEggKey } from '@/features/daily-brief/easter-eggs/catalog';

describe('easter-egg catalog', () => {
  it('isEggKey accepts every known catalog key', () => {
    expect(isEggKey('shabbat')).toBe(true);
    expect(isEggKey('six-seven')).toBe(true);
    expect(isEggKey('mashallah')).toBe(true);
    for (const key of Object.keys(EGG_CATALOG)) {
      expect(isEggKey(key)).toBe(true);
    }
  });

  it('isEggKey rejects unknown and non-string values', () => {
    expect(isEggKey('nope')).toBe(false);
    // Retired effects: a leftover DB row with one of these keys must show nothing.
    expect(isEggKey('anniversary-blueprint')).toBe(false);
    expect(isEggKey('anniversary-salute')).toBe(false);
    expect(isEggKey('')).toBe(false);
    expect(isEggKey(null)).toBe(false);
    expect(isEggKey(undefined)).toBe(false);
    expect(isEggKey(42)).toBe(false);
  });

  it('isEggKey is not fooled by Object.prototype members', () => {
    // A naive `value in EGG_CATALOG` would wrongly accept these.
    expect(isEggKey('toString')).toBe(false);
    expect(isEggKey('constructor')).toBe(false);
    expect(isEggKey('hasOwnProperty')).toBe(false);
  });
});
