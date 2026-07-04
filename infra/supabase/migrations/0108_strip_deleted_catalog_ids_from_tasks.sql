-- Keep tasks.tag_ids / tasks.assignee_ids free of dangling ids when a tag or an
-- assignee is deleted.
--
-- These are uuid[] columns, so Postgres can't put a foreign key on their elements.
-- Deleting a tag/assignee cleaned the client store but never the DB, so the arrays
-- accumulated ids pointing at rows that no longer exist (phantom chips, dashboard
-- ghost buckets, dirty data for future migrations). The singular tasks.assignee_id
-- has an FK (on delete set null) and member assignees are deactivated rather than
-- deleted (0094) — but external assignees and tags are hard-deleted, and their
-- array ids were left behind.
--
-- Two BEFORE DELETE triggers strip the id from every task in the same workspace,
-- authoritatively and regardless of which path issued the delete. BEFORE (not
-- AFTER) so the cleanup runs ahead of the assignee FK's own SET NULL, keeping the
-- interaction simple.
--
-- IMPORTANT for assignees: validate_task_assignees (0035) fires on every task
-- UPDATE and re-derives assignee_id from assignee_ids AND re-prepends assignee_id
-- back into the array. So we must clear BOTH columns in the same UPDATE, otherwise
-- a lingering assignee_id = OLD.id would resurrect the id we just removed.

-- ── tags → tasks.tag_ids ────────────────────────────────────────────
create or replace function public.strip_deleted_tag_from_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.tasks
     set tag_ids = array_remove(coalesce(tag_ids, '{}'::uuid[]), old.id)
   where workspace_id = old.workspace_id
     and old.id = any(tag_ids);
  return old;
end;
$$;

drop trigger if exists tags_strip_from_tasks on public.tags;
create trigger tags_strip_from_tasks
  before delete on public.tags
  for each row execute function public.strip_deleted_tag_from_tasks();

-- ── assignees → tasks.assignee_ids (+ singular assignee_id) ──────────
create or replace function public.strip_deleted_assignee_from_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.tasks
     set assignee_ids = array_remove(coalesce(assignee_ids, '{}'::uuid[]), old.id),
         assignee_id   = nullif(assignee_id, old.id)
   where workspace_id = old.workspace_id
     and (old.id = any(assignee_ids) or assignee_id = old.id);
  return old;
end;
$$;

drop trigger if exists assignees_strip_from_tasks on public.assignees;
create trigger assignees_strip_from_tasks
  before delete on public.assignees
  for each row execute function public.strip_deleted_assignee_from_tasks();
