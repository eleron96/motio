import { describe, expect, it } from 'vitest';
import {
  buildCreateRepeatsOptions,
  filterProjectsByQuery,
  getAutoRepeatUntilOnEndsChange,
  getAutoRepeatUntilOnFrequencyChange,
  getDefaultRepeatUntil,
  resolveProjectQueryFromKeyDown,
  resolveRepeatValidationMessage,
  shouldAutoSyncRepeatUntil,
  validateRepeatConfig,
} from '@/features/planner/lib/taskFormRules';

describe('taskFormRules', () => {
  it('filters projects by name and code using normalized query', () => {
    const projects = [
      { id: 'p1', name: 'Alpha', code: 'AL' },
      { id: 'p2', name: 'Beta', code: null },
      { id: 'p3', name: 'Gamma', code: 'GM' },
    ];

    expect(filterProjectsByQuery(projects, '  al  ').map((project) => project.id)).toEqual(['p1']);
    expect(filterProjectsByQuery(projects, 'gm').map((project) => project.id)).toEqual(['p3']);
    expect(filterProjectsByQuery(projects, '').map((project) => project.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('resolves project query from keydown input consistently', () => {
    expect(resolveProjectQueryFromKeyDown({
      currentQuery: 'ab',
      key: 'Backspace',
      isComposing: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    })).toBe('a');

    expect(resolveProjectQueryFromKeyDown({
      currentQuery: 'ab',
      key: 'Escape',
      isComposing: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    })).toBe('');

    expect(resolveProjectQueryFromKeyDown({
      currentQuery: 'ab',
      key: 'c',
      isComposing: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    })).toBe('abc');

    expect(resolveProjectQueryFromKeyDown({
      currentQuery: 'ab',
      key: 'c',
      isComposing: false,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
    })).toBeNull();

    expect(resolveProjectQueryFromKeyDown({
      currentQuery: 'ab',
      key: 'c',
      isComposing: true,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    })).toBeNull();
  });

  it('computes default repeat end date and validates repeat config', () => {
    expect(getDefaultRepeatUntil('2026-01-30')).toBe('2026-01-31');
    expect(getDefaultRepeatUntil('2026-01-31')).toBe('2026-01-31');

    expect(validateRepeatConfig({
      frequency: 'none',
      ends: 'never',
      until: '',
      count: 0,
    })).toBeNull();

    expect(validateRepeatConfig({
      frequency: 'weekly',
      ends: 'after',
      until: '',
      count: 0,
    })).toBe('missing_count');

    expect(validateRepeatConfig({
      frequency: 'weekly',
      ends: 'on',
      until: '',
      count: 4,
    })).toBe('missing_until');

    expect(resolveRepeatValidationMessage({
      frequency: 'weekly',
      ends: 'after',
      until: '',
      count: 0,
    }, {
      missingCount: 'count required',
      missingUntil: 'until required',
    })).toBe('count required');

    expect(resolveRepeatValidationMessage({
      frequency: 'weekly',
      ends: 'on',
      until: '',
      count: 4,
    }, {
      missingCount: 'count required',
      missingUntil: 'until required',
    })).toBe('until required');

    expect(resolveRepeatValidationMessage({
      frequency: 'weekly',
      ends: 'never',
      until: '',
      count: 4,
    }, {
      missingCount: 'count required',
      missingUntil: 'until required',
    })).toBeNull();

    expect(buildCreateRepeatsOptions({
      frequency: 'weekly',
      ends: 'on',
      until: '2026-03-01',
      count: 7,
    })).toEqual({
      frequency: 'weekly',
      ends: 'on',
      untilDate: '2026-03-01',
      count: undefined,
    });

    expect(buildCreateRepeatsOptions({
      frequency: 'weekly',
      ends: 'after',
      until: '2026-03-01',
      count: 7,
    })).toEqual({
      frequency: 'weekly',
      ends: 'after',
      untilDate: undefined,
      count: 7,
    });

    expect(getAutoRepeatUntilOnFrequencyChange({
      nextFrequency: 'weekly',
      currentEnds: 'on',
      baseDate: '2026-01-31',
    })).toBe('2026-01-31');
    expect(getAutoRepeatUntilOnFrequencyChange({
      nextFrequency: 'none',
      currentEnds: 'on',
      baseDate: '2026-01-31',
    })).toBeNull();

    expect(getAutoRepeatUntilOnEndsChange({
      nextEnds: 'on',
      baseDate: '2026-01-31',
    })).toBe('2026-01-31');
    expect(getAutoRepeatUntilOnEndsChange({
      nextEnds: 'never',
      baseDate: '2026-01-31',
    })).toBeNull();

    expect(shouldAutoSyncRepeatUntil({
      frequency: 'weekly',
      ends: 'on',
      auto: true,
    })).toBe(true);
    expect(shouldAutoSyncRepeatUntil({
      frequency: 'none',
      ends: 'on',
      auto: true,
    })).toBe(false);
  });
});
