import { describe, expect, it, vi } from 'vitest';

// The labels resolve through lingui at call time; the tagged-template stub is the
// shape the rest of the suite uses.
vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

import {
  DEFAULT_TIME_OFF_MOTIF_ID,
  getTimeOffMotifId,
  getTimeOffMotifLabel,
  isValidTimeOffMotifId,
  resolveRowMotif,
  resolveTimeOffMotifId,
  TIME_OFF_MOTIF_IDS,
  TIME_OFF_MOTIF_PREFERENCE_KEY,
} from '@/features/planner/lib/timeOffMotifs';

describe('time-off motif registry', () => {
  it('uses the stable preference key', () => {
    expect(TIME_OFF_MOTIF_PREFERENCE_KEY).toBe('time_off_motif');
  });

  it('has unique ids and contains its own default', () => {
    expect(new Set(TIME_OFF_MOTIF_IDS).size).toBe(TIME_OFF_MOTIF_IDS.length);
    expect(TIME_OFF_MOTIF_IDS).toContain(DEFAULT_TIME_OFF_MOTIF_ID);
  });

  // getTimeOffMotifLabel falls through to Palm, so a motif added to the registry
  // without its own case would silently show up in the picker named "Palm".
  it('gives every registered motif its own label', () => {
    const labels = TIME_OFF_MOTIF_IDS.map(getTimeOffMotifLabel);

    expect(new Set(labels).size).toBe(TIME_OFF_MOTIF_IDS.length);
  });

  it('accepts only known ids', () => {
    expect(isValidTimeOffMotifId('palm')).toBe(true);
    expect(isValidTimeOffMotifId('sun')).toBe(true);
    expect(isValidTimeOffMotifId('pineapple')).toBe(false);
    expect(isValidTimeOffMotifId(null)).toBe(false);
    expect(isValidTimeOffMotifId(7)).toBe(false);
  });
});

describe('getTimeOffMotifId', () => {
  it('reads a valid stored value', () => {
    expect(getTimeOffMotifId({ time_off_motif: 'sun' })).toBe('sun');
  });

  // Preferences is a free-form JSONB written straight through PostgREST, so the
  // reader is the only thing standing between a junk value and the UI.
  it('falls back to the default for anything else', () => {
    expect(getTimeOffMotifId(null)).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
    expect(getTimeOffMotifId(undefined)).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
    expect(getTimeOffMotifId({})).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
    expect(getTimeOffMotifId({ time_off_motif: 'kraken' })).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
    expect(getTimeOffMotifId({ time_off_motif: 42 })).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
    expect(getTimeOffMotifId({ accent_color: 'sky' })).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
  });

  it('does not confuse the raw-value reader with the preferences reader', () => {
    expect(resolveTimeOffMotifId('sun')).toBe('sun');
    expect(resolveTimeOffMotifId({ time_off_motif: 'sun' })).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
  });
});

describe('resolveRowMotif', () => {
  it('reads my own row from the live preferences, not from the assignee', () => {
    expect(resolveRowMotif({
      isMe: true,
      myPreferences: { time_off_motif: 'sun' },
      assigneeMotif: 'palm',
    })).toBe('sun');
  });

  it('reads a teammate row from their assignee record', () => {
    expect(resolveRowMotif({
      isMe: false,
      myPreferences: { time_off_motif: 'sun' },
      assigneeMotif: 'palm',
    })).toBe('palm');
  });

  it('falls back to the default when nothing is known', () => {
    expect(resolveRowMotif({ isMe: true, myPreferences: null })).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
    expect(resolveRowMotif({ isMe: false })).toBe(DEFAULT_TIME_OFF_MOTIF_ID);
  });
});
