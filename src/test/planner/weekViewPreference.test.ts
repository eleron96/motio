import { describe, expect, it } from 'vitest';
import { isWeekViewEnabled, WEEK_VIEW_PREFERENCE_KEY } from '@/features/planner/lib/weekViewPreference';

describe('weekViewPreference', () => {
  it('uses the stable storage key', () => {
    expect(WEEK_VIEW_PREFERENCE_KEY).toBe('week_view_enabled');
  });

  it('is enabled only when the flag is strictly true', () => {
    expect(isWeekViewEnabled({ week_view_enabled: true })).toBe(true);
  });

  it('treats missing, false, or non-boolean values as disabled', () => {
    expect(isWeekViewEnabled(null)).toBe(false);
    expect(isWeekViewEnabled(undefined)).toBe(false);
    expect(isWeekViewEnabled({})).toBe(false);
    expect(isWeekViewEnabled({ week_view_enabled: false })).toBe(false);
    expect(isWeekViewEnabled({ week_view_enabled: 'true' })).toBe(false);
    expect(isWeekViewEnabled({ daily_brief_enabled: true })).toBe(false);
  });
});
