-- Performance indexes for the live-sync reconcile workload.
--
-- 1. task_comments delta query:  WHERE workspace_id = ? AND updated_at > ?
-- 2. task_comments count query:  WHERE workspace_id = ? AND task_id IN (...) AND deleted_at IS NULL
-- 3. tasks delta query:          WHERE workspace_id = ? AND updated_at > ?
--
-- Use CONCURRENTLY to avoid long write locks on production data.

create index concurrently if not exists task_comments_ws_updated_idx
  on public.task_comments (workspace_id, updated_at);

create index concurrently if not exists task_comments_ws_task_active_idx
  on public.task_comments (workspace_id, task_id)
  where deleted_at is null;

create index concurrently if not exists tasks_ws_updated_idx
  on public.tasks (workspace_id, updated_at);
