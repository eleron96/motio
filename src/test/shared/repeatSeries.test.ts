import { describe, expect, it } from 'vitest';
import { inferRepeatCadence } from '@/shared/domain/repeatSeries';

describe('repeatSeries', () => {
  it('returns generic cadence when there is not enough data', () => {
    expect(inferRepeatCadence([])).toBe('generic');
    expect(inferRepeatCadence([{ startDate: '2026-02-01' }])).toBe('generic');
  });

  it('infers daily cadence', () => {
    const cadence = inferRepeatCadence([
      { startDate: '2026-02-02' },
      { startDate: '2026-02-01' },
    ]);

    expect(cadence).toBe('daily');
  });

  it('infers weekly, monthly and yearly cadences', () => {
    expect(inferRepeatCadence([
      { startDate: '2026-02-01' },
      { startDate: '2026-02-08' },
    ])).toBe('weekly');

    expect(inferRepeatCadence([
      { startDate: '2026-02-01' },
      { startDate: '2026-03-03' },
    ])).toBe('monthly');

    expect(inferRepeatCadence([
      { startDate: '2026-02-01' },
      { startDate: '2027-02-01' },
    ])).toBe('yearly');
  });

  it('falls back to generic for non-standard intervals', () => {
    expect(inferRepeatCadence([
      { startDate: '2026-02-01' },
      { startDate: '2026-02-11' },
    ])).toBe('generic');
  });
});
