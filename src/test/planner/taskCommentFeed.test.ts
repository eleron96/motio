import { describe, expect, it } from 'vitest';
import { applyLiveTaskComment, mergeNewestTaskCommentPage } from '@/shared/domain/taskCommentFeed';
import type { TaskComment } from '@/features/planner/types/planner';

const comment = (id: string, createdAt: string, content = id): TaskComment => ({
  id,
  taskId: 'task-1',
  authorId: 'anna',
  authorDisplayName: 'Anna',
  authorAvatarUrl: null,
  authorStatus: 'ACTIVE',
  content,
  mentionedUserIds: [],
  createdAt,
  updatedAt: createdAt,
  isEdited: false,
});

describe('applyLiveTaskComment', () => {
  const feed = [
    comment('a', '2026-10-30T08:00:00.000Z'),
    comment('c', '2026-10-30T10:00:00.000Z'),
  ];

  it('adds a teammate comment in time order', () => {
    const next = applyLiveTaskComment(feed, 'b', comment('b', '2026-10-30T09:00:00.000Z'));
    expect(next.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces an edited comment instead of adding a second copy', () => {
    const next = applyLiveTaskComment(feed, 'c', comment('c', '2026-10-30T10:00:00.000Z', 'edited'));
    expect(next).toHaveLength(2);
    expect(next[1].content).toBe('edited');
  });

  it('drops a deleted comment and ignores one it never showed', () => {
    expect(applyLiveTaskComment(feed, 'a', null).map((item) => item.id)).toEqual(['c']);
    expect(applyLiveTaskComment(feed, 'zzz', null)).toBe(feed);
  });
});

describe('mergeNewestTaskCommentPage', () => {
  const older = comment('a', '2026-10-30T07:00:00.000Z');
  const shown = [
    older,
    comment('b', '2026-10-30T08:00:00.000Z'),
    comment('c', '2026-10-30T09:00:00.000Z'),
    comment('x', '2026-10-30T09:30:00.000Z'),
  ];

  it('adds what was missed, drops what was deleted meanwhile, keeps older loaded pages', () => {
    // The page spans 08:30–10:00: 'x' sits inside it and is missing, so it
    // was deleted; 'a' and 'b' are older than the page and stay.
    const page = [
      comment('b2', '2026-10-30T08:30:00.000Z'),
      comment('c', '2026-10-30T09:00:00.000Z', 'edited'),
      comment('d', '2026-10-30T10:00:00.000Z'),
    ];

    const next = mergeNewestTaskCommentPage(shown, page, false);

    expect(next.gap).toBe(false);
    expect(next.comments.map((item) => item.id)).toEqual(['a', 'b', 'b2', 'c', 'd']);
    expect(next.comments.find((item) => item.id === 'c')?.content).toBe('edited');
  });

  it('with the whole feed in one page, older ones missing from it are gone', () => {
    const next = mergeNewestTaskCommentPage(shown, [comment('c', '2026-10-30T09:00:00.000Z')], true);
    // 'a' and 'b' were deleted; 'x' is newer than the page and stays.
    expect(next.comments.map((item) => item.id)).toEqual(['c', 'x']);
  });

  it('keeps a comment newer than the page: it arrived live while the page was on its way', () => {
    const justPosted = comment('mine', '2026-10-30T11:00:00.000Z');
    const next = mergeNewestTaskCommentPage(
      [...shown, justPosted],
      [comment('c', '2026-10-30T09:00:00.000Z'), comment('x', '2026-10-30T09:30:00.000Z')],
      true,
    );
    expect(next.comments.map((item) => item.id)).toEqual(['c', 'x', 'mine']);
  });

  it('reports a gap when more than a page was missed', () => {
    const page = [comment('p1', '2026-10-30T12:00:00.000Z'), comment('p2', '2026-10-30T12:30:00.000Z')];
    const next = mergeNewestTaskCommentPage(shown, page, false);
    expect(next).toEqual({ comments: page, gap: true });
  });
});
