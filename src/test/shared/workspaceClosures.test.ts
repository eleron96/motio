import { describe, expect, it } from 'vitest';
import {
  closureDaysByDate,
  closureInputProblem,
  sortClosures,
  withClosures,
} from '@/shared/domain/workspaceClosures';

const closure = (id: string, name: string, startDate: string, endDate: string) => ({ id, name, startDate, endDate });

describe('days off for the whole workspace', () => {
  it('covers both ends and clips to the window shown', () => {
    const days = closureDaysByDate(
      [closure('c1', 'Winter closure', '2026-12-30', '2027-01-02')],
      { startIso: '2026-01-01', endIso: '2026-12-31' },
    );
    expect(days).toEqual({ '2026-12-30': ['Winter closure'], '2026-12-31': ['Winter closure'] });
  });

  it('keeps one entry per day when closures overlap', () => {
    const days = closureDaysByDate(
      [closure('c1', 'Inventory', '2026-07-01', '2026-07-02'), closure('c2', 'Summer', '2026-07-02', '2026-07-03')],
      { startIso: '2026-01-01', endIso: '2026-12-31' },
    );
    expect(days['2026-07-02']).toEqual(['Inventory', 'Summer']);
    expect(Object.keys(days)).toHaveLength(3);
  });

  it('adds closures to the holidays without counting a shared day twice', () => {
    const holidays = { '2026-12-25': ['Christmas'] };
    const merged = withClosures(holidays, { '2026-12-25': ['Winter closure'], '2026-12-24': ['Winter closure'] });
    expect(merged).toEqual({ '2026-12-24': ['Winter closure'], '2026-12-25': ['Christmas', 'Winter closure'] });
    expect(holidays).toEqual({ '2026-12-25': ['Christmas'] });
  });

  it('returns the very same holiday map when there is nothing to add', () => {
    const holidays = { '2026-12-25': ['Christmas'] };
    expect(withClosures(holidays, {})).toBe(holidays);
  });

  it('checks what an admin types', () => {
    expect(closureInputProblem({ name: ' ', startDate: '2026-12-24', endDate: '2026-12-31' })).toBe('name');
    expect(closureInputProblem({ name: 'x'.repeat(81), startDate: '2026-12-24', endDate: '2026-12-31' })).toBe('name');
    expect(closureInputProblem({ name: 'Winter', startDate: '2026-12-31', endDate: '2026-12-24' })).toBe('dates');
    expect(closureInputProblem({ name: 'Winter', startDate: '', endDate: '2026-12-24' })).toBe('dates');
    expect(closureInputProblem({ name: 'Winter', startDate: '2026-01-01', endDate: '2027-01-03' })).toBe('too_long');
    expect(closureInputProblem({ name: 'Winter', startDate: '2026-12-24', endDate: '2026-12-24' })).toBeNull();
  });

  it('lists what is coming first and the past after it', () => {
    const sorted = sortClosures(
      [
        closure('old', 'Old', '2026-01-02', '2026-01-03'),
        closure('later', 'Later', '2026-12-24', '2026-12-31'),
        closure('now', 'Now', '2026-11-08', '2026-11-12'),
        closure('older', 'Older', '2025-12-24', '2025-12-31'),
      ],
      '2026-11-09',
    );
    expect(sorted.map((item) => item.id)).toEqual(['now', 'later', 'old', 'older']);
  });
});
