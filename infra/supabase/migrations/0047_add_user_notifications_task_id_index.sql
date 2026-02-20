-- Speeds up ON DELETE SET NULL on user_notifications.task_id when tasks are deleted.
-- Without this index, PostgreSQL may scan the whole notifications table per delete.
create index concurrently if not exists user_notifications_task_id_idx
  on public.user_notifications (task_id)
  where task_id is not null;
