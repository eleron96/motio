import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceTemplateFromCatalog,
  diffWorkspaceTemplate,
  normalizeWorkspaceTemplate,
} from '@/shared/domain/workspaceTemplate';

describe('workspaceTemplate', () => {
  it('normalizes saved template payload and strips inline status emoji', () => {
    const template = normalizeWorkspaceTemplate({
      statuses: [
        { name: 'Done', emoji: '  ', color: '#111111', is_final: true, is_cancelled: false },
        { name: '🚫 Blocked', color: '#222222', is_final: false, is_cancelled: true },
      ],
      task_types: [{ name: ' Feature ', icon: 'sparkles' }],
      tags: [{ name: 'Urgent', color: '#ff0000' }],
    });

    expect(template.statuses).toEqual([
      { name: 'Done', emoji: null, color: '#111111', is_final: true, is_cancelled: false },
      { name: 'Blocked', emoji: '🚫', color: '#222222', is_final: false, is_cancelled: true },
    ]);
    expect(template.taskTypes).toEqual([{ name: 'Feature', icon: 'sparkles' }]);
    expect(template.tags).toEqual([{ name: 'Urgent', color: '#ff0000' }]);
  });

  it('builds template from current catalog and keeps status flags', () => {
    const template = buildWorkspaceTemplateFromCatalog({
      statuses: [{ name: 'Done', emoji: '✅', color: '#00ff00', isFinal: true, isCancelled: false }],
      taskTypes: [{ name: 'Bug', icon: 'bug' }],
      tags: [{ name: 'Backend', color: '#0000ff' }],
    });

    expect(template).toEqual({
      statuses: [{ name: 'Done', emoji: '✅', color: '#00ff00', is_final: true, is_cancelled: false }],
      taskTypes: [{ name: 'Bug', icon: 'bug' }],
      tags: [{ name: 'Backend', color: '#0000ff' }],
    });
  });

  it('returns only missing items by name when applying template', () => {
    const diff = diffWorkspaceTemplate(
      {
        statuses: [
          { name: 'Done', emoji: null, color: '#111111', is_final: true, is_cancelled: false },
          { name: 'done', emoji: '✅', color: '#111111', is_final: true, is_cancelled: false },
          { name: 'Blocked', emoji: '🚫', color: '#222222', is_final: false, is_cancelled: true },
        ],
        taskTypes: [
          { name: 'Bug', icon: 'bug' },
          { name: 'Feature', icon: 'sparkles' },
        ],
        tags: [
          { name: 'Backend', color: '#0000ff' },
          { name: 'backend', color: '#123456' },
          { name: 'Urgent', color: '#ff0000' },
        ],
      },
      {
        statuses: [{ name: 'done' }],
        taskTypes: [{ name: 'feature' }],
        tags: [{ name: 'backend' }],
      },
    );

    expect(diff).toEqual({
      statuses: [{ name: 'Blocked', emoji: '🚫', color: '#222222', is_final: false, is_cancelled: true }],
      taskTypes: [{ name: 'Bug', icon: 'bug' }],
      tags: [{ name: 'Urgent', color: '#ff0000' }],
    });
  });
});
