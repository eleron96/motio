import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { PlannerStore } from '@/features/planner/store/plannerStore.contract';

// The day/week timeline always opens on today, so a remembered date there only
// made the first load go out twice (once for it, once for today).
describe('planner persisted date', () => {
  const options = usePlannerStore.persist.getOptions();
  const current = usePlannerStore.getState();

  it('remembers the date only for the calendar', () => {
    const day = options.partialize!({ ...current, viewMode: 'day', currentDate: '2026-01-05' } as PlannerStore);
    const calendar = options.partialize!({ ...current, viewMode: 'calendar', currentDate: '2026-01-05' } as PlannerStore);
    expect(day).not.toHaveProperty('currentDate');
    expect(calendar).toMatchObject({ viewMode: 'calendar', currentDate: '2026-01-05' });
  });

  it('ignores a day-view date saved by an older version', () => {
    const today = { ...current, currentDate: '2026-10-31' } as PlannerStore;
    const merged = options.merge!({ viewMode: 'day', groupMode: 'project', currentDate: '2026-03-01' }, today);
    expect(merged.currentDate).toBe('2026-10-31');
    expect(merged.groupMode).toBe('project');
  });

  it('restores the calendar date', () => {
    const today = { ...current, currentDate: '2026-10-31' } as PlannerStore;
    const merged = options.merge!({ viewMode: 'calendar', currentDate: '2026-03-01' }, today);
    expect(merged.currentDate).toBe('2026-03-01');
  });
});
