import { describe, expect, it } from 'vitest';
import { canEditPersonColor, isPersonColor, toMonogramColor } from '@/shared/lib/personColor';
import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';

describe('isPersonColor', () => {
  it('accepts every preset offered in settings', () => {
    PERSON_PRESET_COLORS.forEach((color) => {
      expect(isPersonColor(color)).toBe(true);
    });
  });

  it('rejects anything that is not a #rrggbb string', () => {
    ['#fff', 'red', 'hsl(210, 72%, 80%)', '#12345', '#1234567', '', null, undefined, 42]
      .forEach((value) => {
        expect(isPersonColor(value)).toBe(false);
      });
  });
});

describe('toMonogramColor', () => {
  it('keeps the hue of the picked colour but darkens it for white initials', () => {
    // Preset blue is hsl(210, 72%, 80%) — the monogram keeps 210 and drops to
    // the density getMonogramColor uses everywhere else.
    expect(toMonogramColor('#a7ccf1')).toBe('hsl(210, 55%, 45%)');
  });

  it('maps each preset to a distinct monogram colour', () => {
    const monograms = new Set(PERSON_PRESET_COLORS.map((color) => toMonogramColor(color)));
    expect(monograms.size).toBe(PERSON_PRESET_COLORS.length);
  });

  it('stays grey for a greyscale colour instead of inventing a hue', () => {
    expect(toMonogramColor('#cccccc')).toBe('hsl(0, 0%, 45%)');
  });

  it('returns null for a missing or malformed colour so the caller keeps its fallback', () => {
    expect(toMonogramColor(null)).toBeNull();
    expect(toMonogramColor(undefined)).toBeNull();
    expect(toMonogramColor('nope')).toBeNull();
  });
});

describe('canEditPersonColor', () => {
  it('lets an admin recolour anyone', () => {
    expect(canEditPersonColor({
      isAdmin: true,
      assigneeUserId: 'someone-else',
      currentUserId: 'me',
    })).toBe(true);
  });

  it('lets a non-admin recolour themselves', () => {
    expect(canEditPersonColor({
      isAdmin: false,
      assigneeUserId: 'me',
      currentUserId: 'me',
    })).toBe(true);
  });

  it('stops a non-admin from recolouring a teammate', () => {
    expect(canEditPersonColor({
      isAdmin: false,
      assigneeUserId: 'someone-else',
      currentUserId: 'me',
    })).toBe(false);
  });

  it('keeps accountless people admin-only — nobody can claim them', () => {
    expect(canEditPersonColor({
      isAdmin: false,
      assigneeUserId: null,
      currentUserId: 'me',
    })).toBe(false);
    expect(canEditPersonColor({
      isAdmin: true,
      assigneeUserId: null,
      currentUserId: 'me',
    })).toBe(true);
  });

  it('does not treat two signed-out sessions as the same person', () => {
    expect(canEditPersonColor({
      isAdmin: false,
      assigneeUserId: null,
      currentUserId: null,
    })).toBe(false);
  });
});
