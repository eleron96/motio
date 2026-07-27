import { describe, expect, it } from 'vitest';
import {
  buildTimeOffIndex,
  findTimeOffConflict,
  shouldShadeTimeOffDay,
  timeOffCoveredDays,
  timeOffCoversDay,
  timeOffMinLanes,
  timeOffReservedPeriods,
  withTimeOffPreview,
} from '@/features/planner/lib/timeOff';
import type { TimeOff } from '@/features/planner/types/planner';

const record = (over: Partial<TimeOff> = {}): TimeOff => ({
  id: 't1',
  assigneeId: 'a1',
  startDate: '2026-08-03',
  endDate: '2026-08-07',
  note: null,
  ...over,
});

const days = (isoDates: string[]) => isoDates.map((iso) => new Date(`${iso}T12:00:00Z`));

describe('timeOffCoversDay', () => {
  it('is inclusive on both ends', () => {
    const item = record();

    expect(timeOffCoversDay(item, '2026-08-03')).toBe(true);
    expect(timeOffCoversDay(item, '2026-08-07')).toBe(true);
    expect(timeOffCoversDay(item, '2026-08-02')).toBe(false);
    expect(timeOffCoversDay(item, '2026-08-08')).toBe(false);
  });

  it('covers a single-day record', () => {
    const item = record({ startDate: '2026-08-08', endDate: '2026-08-08' });

    expect(timeOffCoversDay(item, '2026-08-08')).toBe(true);
  });
});

describe('timeOffCoveredDays', () => {
  it('returns only the visible days inside the period', () => {
    const visible = days(['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-09']);

    expect(timeOffCoveredDays(record(), visible)).toEqual(['2026-08-03', '2026-08-04']);
  });
});

describe('shouldShadeTimeOffDay', () => {
  it('shades a covered working day', () => {
    expect(shouldShadeTimeOffDay(true, false, false)).toBe(true);
  });

  it('leaves weekends and holidays untouched', () => {
    expect(shouldShadeTimeOffDay(true, true, false)).toBe(false);
    expect(shouldShadeTimeOffDay(true, false, true)).toBe(false);
  });

  it('does not shade a day outside the period', () => {
    expect(shouldShadeTimeOffDay(false, false, false)).toBe(false);
  });
});

describe('lane math', () => {
  it('requires at least one lane in a row that has a record', () => {
    expect(timeOffMinLanes([record()])).toBe(1);
  });

  it('changes nothing for a row without records', () => {
    expect(timeOffMinLanes([])).toBe(0);
    expect(timeOffMinLanes(undefined)).toBe(0);
    expect(timeOffReservedPeriods(undefined)).toEqual([]);
    expect(timeOffReservedPeriods([])).toEqual([]);
  });

  it('hands the packer just the periods, one per record', () => {
    expect(timeOffReservedPeriods([
      record(),
      record({ id: 't2', startDate: '2026-09-01', endDate: '2026-09-02' }),
    ])).toEqual([
      { startDate: '2026-08-03', endDate: '2026-08-07' },
      { startDate: '2026-09-01', endDate: '2026-09-02' },
    ]);
  });
});

describe('findTimeOffConflict', () => {
  const siblings = [record(), record({ id: 't2', startDate: '2026-09-01', endDate: '2026-09-02' })];

  it('finds an overlapping period', () => {
    expect(findTimeOffConflict({ startDate: '2026-08-05', endDate: '2026-08-09' }, siblings)?.id).toBe('t1');
  });

  it('allows an adjacent day', () => {
    expect(findTimeOffConflict({ startDate: '2026-08-08', endDate: '2026-08-08' }, siblings)).toBeNull();
  });

  it('ignores the record being edited', () => {
    expect(findTimeOffConflict({ id: 't1', startDate: '2026-08-04', endDate: '2026-08-06' }, siblings)).toBeNull();
  });
});

describe('withTimeOffPreview', () => {
  it('applies the preview to the dragged record only', () => {
    const preview = { id: 't1', startDate: '2026-08-04', endDate: '2026-08-10' };

    expect(withTimeOffPreview(record(), preview).endDate).toBe('2026-08-10');
    expect(withTimeOffPreview(record({ id: 't2' }), preview).endDate).toBe('2026-08-07');
  });
});

describe('buildTimeOffIndex', () => {
  const visible = days(['2026-08-03', '2026-08-04', '2026-08-05', '2026-09-01']);

  it('groups records by row and maps their covered days', () => {
    const index = buildTimeOffIndex(
      [record(), record({ id: 't2', assigneeId: 'a2', startDate: '2026-09-01', endDate: '2026-09-01' })],
      visible,
    );

    expect(index.byRowId.get('a1')).toHaveLength(1);
    expect([...(index.daysByRowId.get('a1') ?? new Map()).keys()])
      .toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
    expect([...(index.daysByRowId.get('a2') ?? new Map()).keys()]).toEqual(['2026-09-01']);
  });

  it('returns a stable empty index when there is nothing to show', () => {
    expect(buildTimeOffIndex([], visible)).toBe(buildTimeOffIndex([], visible));
  });

  it('reflects the drag preview so shading follows the bar', () => {
    const index = buildTimeOffIndex(
      [record({ startDate: '2026-08-03', endDate: '2026-08-03' })],
      visible,
      { id: 't1', startDate: '2026-08-03', endDate: '2026-08-05' },
    );

    expect([...(index.daysByRowId.get('a1') ?? new Map()).keys()])
      .toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });
});
