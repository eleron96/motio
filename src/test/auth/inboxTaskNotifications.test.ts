import { describe, expect, it } from 'vitest';

import { mapInboxTaskNotifications } from '../../../infra/supabase/functions/inbox/taskNotifications';

describe('mapInboxTaskNotifications', () => {
  it('preserves comment_mention type and comment payload from inbox rows', () => {
    const notifications = mapInboxTaskNotifications(
      [{
        id: 'notification-1',
        workspace_id: 'workspace-1',
        actor_user_id: 'user-2',
        type: 'comment_mention',
        task_id: 'task-1',
        task_title_snapshot: 'Task title',
        task_start_date_snapshot: '2026-03-11',
        comment_id: 'comment-1',
        comment_preview: 'Hello @niko',
        created_at: '2026-03-11T08:00:00.000Z',
        read_at: null,
      }],
      new Map([['workspace-1', 'Workspace']]),
      new Map([['user-2', { displayName: 'Anna', email: 'anna@example.com' }]]),
      new Map([['task-1', { title: 'Task title', startDate: '2026-03-11' }]]),
    );

    expect(notifications).toEqual([{
      id: 'notification-1',
      type: 'comment_mention',
      workspaceId: 'workspace-1',
      workspaceName: 'Workspace',
      actorUserId: 'user-2',
      actorDisplayName: 'Anna',
      actorEmail: 'anna@example.com',
      taskId: 'task-1',
      taskTitle: 'Task title',
      taskStartDate: '2026-03-11',
      taskExists: true,
      commentId: 'comment-1',
      commentPreview: 'Hello @niko',
      createdAt: '2026-03-11T08:00:00.000Z',
      readAt: null,
    }]);
  });

  it('keeps task_assigned notifications without comment payload', () => {
    const notifications = mapInboxTaskNotifications(
      [{
        id: 'notification-2',
        workspace_id: 'workspace-1',
        actor_user_id: 'user-2',
        type: 'task_assigned',
        task_id: 'task-1',
        task_title_snapshot: 'Task title',
        task_start_date_snapshot: '2026-03-11',
        comment_id: 'comment-1',
        comment_preview: 'Should be ignored',
        created_at: '2026-03-11T08:00:00.000Z',
        read_at: null,
      }],
      new Map([['workspace-1', 'Workspace']]),
      new Map([['user-2', { displayName: 'Anna', email: 'anna@example.com' }]]),
      new Map([['task-1', { title: 'Task title', startDate: '2026-03-11' }]]),
    );

    expect(notifications[0]?.type).toBe('task_assigned');
    expect(notifications[0]?.commentId).toBeNull();
    expect(notifications[0]?.commentPreview).toBeNull();
  });
});
