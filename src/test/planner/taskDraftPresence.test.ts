import { describe, expect, it } from 'vitest';
import {
  areTaskDraftsEqual,
  clampTaskDraft,
  collectTeammateDrafts,
  TASK_DRAFT_TEXT_LIMIT,
} from '@/shared/domain/taskDraftPresence';

const members = new Set(['me', 'anna', 'sergey']);

describe('collectTeammateDrafts', () => {
  it('keeps teammates and drops our own drafts', () => {
    const drafts = collectTeammateDrafts({
      me: [{ userId: 'me', drafts: [{ kind: 'subtask-new', text: 'Mine' }] }],
      anna: [{ userId: 'anna', drafts: [{ kind: 'subtask-new', text: 'Call the client' }] }],
    }, 'me', members);

    expect(drafts).toEqual([{ userId: 'anna', draft: { kind: 'subtask-new', text: 'Call the client' } }]);
  });

  it('ignores people outside the workspace and payloads of the wrong shape', () => {
    const drafts = collectTeammateDrafts({
      stranger: [{ userId: 'stranger', drafts: [{ kind: 'comment', text: 'Hi' }] }],
      anna: [
        { userId: 'anna', drafts: [{ kind: 'subtask-edit', text: 'no id' }, { kind: 'unknown', text: 'x' }] },
        { userId: 'anna', drafts: 'not a list' },
        null,
      ],
    }, 'me', members);

    expect(drafts).toEqual([]);
  });

  it('drops blank text but keeps a description edit, which carries none', () => {
    const drafts = collectTeammateDrafts({
      anna: [{ userId: 'anna', drafts: [{ kind: 'comment', text: '   ' }, { kind: 'description' }] }],
    }, 'me', members);

    expect(drafts).toEqual([{ userId: 'anna', draft: { kind: 'description' } }]);
  });

  it('collapses the same draft from two tabs of one person', () => {
    const drafts = collectTeammateDrafts({
      sergey: [
        { userId: 'sergey', drafts: [{ kind: 'subtask-edit', subtaskId: 's1', text: 'Fix' }] },
        { userId: 'sergey', drafts: [{ kind: 'subtask-edit', subtaskId: 's1', text: 'Fix' }] },
      ],
    }, 'me', members);

    expect(drafts).toHaveLength(1);
  });
});

describe('task draft helpers', () => {
  it('cuts text past the limit', () => {
    const draft = clampTaskDraft({ kind: 'comment', text: 'x'.repeat(TASK_DRAFT_TEXT_LIMIT + 10) });
    expect('text' in draft && draft.text.length).toBe(TASK_DRAFT_TEXT_LIMIT);
  });

  it('compares drafts by kind, subtask and text', () => {
    expect(areTaskDraftsEqual({ kind: 'description' }, { kind: 'description' })).toBe(true);
    expect(areTaskDraftsEqual(
      { kind: 'subtask-edit', subtaskId: 'a', text: 'x' },
      { kind: 'subtask-edit', subtaskId: 'b', text: 'x' },
    )).toBe(false);
    expect(areTaskDraftsEqual({ kind: 'comment', text: 'a' }, null)).toBe(false);
  });
});
