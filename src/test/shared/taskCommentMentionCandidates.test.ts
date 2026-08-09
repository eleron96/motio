import { describe, expect, it } from 'vitest';
import {
  buildTaskCommentMentionCandidates,
} from '@/shared/domain/taskCommentMentionCandidates';

describe('taskCommentMentionCandidates', () => {
  it('maps workspace members to mention candidates using display name or email', () => {
    expect(buildTaskCommentMentionCandidates([
      { userId: 'user-2', email: 'ivan@example.com', displayName: 'Ivan', avatarUrl: 'https://cdn.example/ivan.png' },
      { userId: 'user-1', email: 'anna@example.com', displayName: null },
    ])).toEqual([
      { id: 'user-1', userId: 'user-1', name: 'anna@example.com', avatarUrl: null },
      // Carried through so the suggestion list can show the photo.
      { id: 'user-2', userId: 'user-2', name: 'Ivan', avatarUrl: 'https://cdn.example/ivan.png' },
    ]);
  });

  it('skips members without user id or visible label and deduplicates by user id', () => {
    expect(buildTaskCommentMentionCandidates([
      { userId: '', email: 'blank@example.com', displayName: 'Blank' },
      { userId: 'user-1', email: null, displayName: '' },
      { userId: 'user-2', email: 'ivan@example.com', displayName: 'Ivan' },
      { userId: 'user-2', email: 'other@example.com', displayName: 'Other Ivan' },
    ])).toEqual([
      { id: 'user-2', userId: 'user-2', name: 'Ivan', avatarUrl: null },
    ]);
  });
});
