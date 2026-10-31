-- Realtime deletes for tasks and milestones. The timeline subscribes to both
-- with a workspace_id filter (0046), but with the default replica identity a
-- DELETE event carries only the primary key, so the filter never matches and
-- a teammate's deleted task or milestone stayed on everyone's timeline until
-- the next reconcile. REPLICA IDENTITY FULL ships the whole old row — the same
-- fix as time_off (0131) and task_subtasks (0158). Idempotent.
alter table public.tasks replica identity full;
alter table public.milestones replica identity full;
