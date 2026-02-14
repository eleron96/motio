-- Indexes for the core "date range intersects" workload:
--   end_date >= :start AND start_date <= :end
-- Used by Timeline and assignee_unique_task_counts RPC.
--
-- Use CONCURRENTLY to avoid long write locks as data grows.

create index concurrently if not exists tasks_workspace_end_date_idx
  on public.tasks (workspace_id, end_date);

create index concurrently if not exists tasks_workspace_start_date_idx
  on public.tasks (workspace_id, start_date);

