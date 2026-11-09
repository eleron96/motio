import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TaskCommentItem } from '@/features/planner/components/TaskCommentItem';
import type { TaskComment } from '@/features/planner/types/planner';
import { useLocaleStore } from '@/shared/store/localeStore';

// Translations are covered by src/test/smoke/localeCatalogs.test.ts.
vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

const comment: TaskComment = {
  id: 'comment-1',
  taskId: 'task-1',
  authorId: 'user-1',
  authorDisplayName: 'Anna',
  authorAvatarUrl: null,
  authorStatus: 'ACTIVE',
  content: '<p>Drawings are in the shared folder.</p>',
  mentionedUserIds: [],
  createdAt: '2026-11-09T11:57:00Z',
  updatedAt: '2026-11-09T11:57:00Z',
  isEdited: false,
};

// The item settles its content after mounting; act lets that finish before asserting.
const renderComment = () => act(async () => {
  render(
    <TaskCommentItem
      comment={comment}
      currentUserId="user-2"
      isAdmin={false}
      workspaceId="workspace-1"
      mentionCandidates={[]}
      mentionsLoading={false}
      onUpdated={() => {}}
      onDeleted={() => {}}
    />,
  );
});

describe('TaskCommentItem — time of the comment', () => {
  beforeEach(() => {
    // Reset before rendering: changing it while a comment is mounted re-renders it.
    useLocaleStore.getState().setLocale('en');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is written in Russian in the Russian interface', async () => {
    useLocaleStore.getState().setLocale('ru');
    await renderComment();
    expect(screen.getByText('3 минуты назад')).toBeInTheDocument();
    expect(screen.queryByText(/minutes ago/)).not.toBeInTheDocument();
  });

  it('is written in English in the English interface', async () => {
    useLocaleStore.getState().setLocale('en');
    await renderComment();
    expect(screen.getByText('3 minutes ago')).toBeInTheDocument();
  });
});
