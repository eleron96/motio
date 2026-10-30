import { describe, expect, it } from 'vitest';
import { applyLiveTaskComment } from '@/shared/domain/taskCommentFeed';
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
