-- Composite index for the tasks date-range query used in loadWorkspaceData:
--   WHERE workspace_id = ? AND end_date >= ? AND start_date <= ?
--
-- Postgres can satisfy both predicates from a single index scan on
-- (workspace_id, end_date) and then filter start_date without a second
-- index lookup, which is more efficient than a bitmap-AND of two separate
-- single-column indexes.

create index concurrently if not exists tasks_workspace_date_range_idx
  on public.tasks (workspace_id, end_date, start_date);
