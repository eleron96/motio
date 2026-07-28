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

  it('drops retired deadline reminders and keeps task_updated', () => {
    const notifications = mapInboxTaskNotifications(
      [
        {
          id: 'notification-3',
          workspace_id: 'workspace-1',
          actor_user_id: null,
          type: 'deadline_approaching',
          task_id: 'task-1',
          task_title_snapshot: 'Поправить ТЭП АК',
          task_start_date_snapshot: '2026-07-22',
          created_at: '2026-07-23T06:00:00.000Z',
          read_at: null,
        },
        {
          id: 'notification-4',
          workspace_id: 'workspace-1',
          actor_user_id: 'user-2',
          type: 'task_updated',
          task_id: 'task-1',
          task_title_snapshot: 'Поправить ТЭП АК',
          task_start_date_snapshot: '2026-07-22',
          created_at: '2026-07-23T07:00:00.000Z',
          read_at: null,
        },
      ],
      new Map([['workspace-1', 'Workspace']]),
      new Map([['user-2', { displayName: 'Anna', email: 'anna@example.com' }]]),
      new Map([['task-1', { title: 'Поправить ТЭП АК', startDate: '2026-07-22' }]]),
    );

    expect(notifications.map((n) => n.type)).toEqual(['task_updated']);
    expect(notifications[0]?.actorDisplayName).toBe('Anna');
  });

  it('drops rows whose type this build does not know instead of relabeling them', () => {
    const notifications = mapInboxTaskNotifications(
      [{
        id: 'notification-5',
        workspace_id: 'workspace-1',
        actor_user_id: null,
        type: 'future_notification_type',
        task_id: 'task-1',
        task_title_snapshot: 'Task title',
        task_start_date_snapshot: '2026-07-22',
        created_at: '2026-07-23T06:00:00.000Z',
        read_at: null,
      }],
      new Map([['workspace-1', 'Workspace']]),
      new Map(),
      new Map(),
    );

    expect(notifications).toEqual([]);
  });
});
