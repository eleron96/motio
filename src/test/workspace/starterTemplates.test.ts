import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findStarterTemplateProblems } from '@/shared/domain/starterTemplate';
import { readPoCatalog } from '@/test/helpers/poCatalog';

/**
 * Every template, in every interface language, must make sense to the
 * database: links by existing keys, no two statuses or types translated into
 * the same word (a unique index), no overlapping time off of one person. The
 * check reads the real catalogs, so a translation that collapses two words
 * into one fails here, not in someone's first minute in Motio.
 */

const state = vi.hoisted(() => ({ catalog: new Map<string, string>(), missing: [] as string[] }));

vi.mock('@lingui/macro', async () => {
  const helpers = await import('@/test/helpers/poCatalog');
  return { t: helpers.translateThrough(state) };
});

const { STARTER_TEMPLATES } = await import('@/features/workspace/lib/starterTemplates');

describe.each(['en', 'ru', 'de'])('starter templates in %s', (locale) => {
  beforeEach(() => {
    state.catalog = readPoCatalog(locale);
    state.missing = [];
  });

  it.each(STARTER_TEMPLATES.map((template) => [template.id, template] as const))('%s is consistent', (_id, template) => {
    const content = template.build();

    expect(findStarterTemplateProblems(content)).toEqual([]);
    expect(template.title()).not.toBe('');
    expect(template.summary()).not.toBe('');
    if (locale !== 'en') expect(state.missing).toEqual([]);
  });
});

describe('starter templates', () => {
  it('end with the empty one, which brings no examples', () => {
    const empty = STARTER_TEMPLATES.at(-1)!;
    const content = empty.build();

    expect(empty.id).toBe('empty');
    expect([content.projects, content.people, content.tasks, content.milestones, content.timeOff].every((list) => list.length === 0))
      .toBe(true);
  });

  /**
   * The examples sit around the week the person opens the timeline: something
   * done, something in progress, something next — and a series and a vacation,
   * so every kind of bar shows up once.
   */
  it.each(STARTER_TEMPLATES.filter((template) => template.id !== 'empty').map((template) => [template.id, template] as const))(
    '%s shows past, present and future work, a series and a vacation',
    (_id, template) => {
      const content = template.build();
      const statuses = new Set(content.tasks.map((task) => task.status));

      expect(statuses.has('done')).toBe(true);
      expect(statuses.has('doing')).toBe(true);
      expect(statuses.has('todo')).toBe(true);
      expect(content.tasks.some((task) => task.repeat)).toBe(true);
      expect(content.tasks.some((task) => task.people.length > 1)).toBe(true);
      expect(content.timeOff).toHaveLength(1);
      expect(content.milestones.length).toBeGreaterThan(0);
    },
  );
});
