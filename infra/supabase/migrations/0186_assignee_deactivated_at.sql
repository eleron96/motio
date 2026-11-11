-- Workload heatmap: remember WHEN a person stopped being on the team.
--
-- The heatmap divides each day's work by the people who were there to do it.
-- Until now "the people" was whoever is active today, applied to every day on
-- screen — so switching one person off re-divided the past three months by a
-- smaller team and made days that are long over read hotter. With the day a
-- person left stored, a past day keeps the team it really had; only today and
-- the future follow the change.
--
-- assignees.created_at already says when a person was added. This adds the
-- other end: deactivated_at is stamped when is_active goes true → false and
-- cleared when the person is switched back on (rejoining a workspace reuses the
-- same row, 0094). A trigger owns the column: is_active is flipped from several
-- places (the client, remove_member_assignee, sync_member_assignee), and none
-- of them has to know about it — nor can a client write its own date.
--
-- People who are already inactive stay with deactivated_at = null: when they
-- left is not known, and the heatmap keeps leaving them out of every day, as it
-- does today. History becomes exact from this migration on.
--
-- Idempotent.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS assignees_stamp_deactivated_at ON public.assignees;
--   DROP FUNCTION IF EXISTS public.assignees_stamp_deactivated_at();
--   ALTER TABLE public.assignees DROP COLUMN IF EXISTS deactivated_at;

alter table public.assignees
  add column if not exists deactivated_at timestamptz;

create or replace function public.assignees_stamp_deactivated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.deactivated_at := case when new.is_active then null else now() end;
  elsif new.is_active is distinct from old.is_active then
    new.deactivated_at := case when new.is_active then null else now() end;
  else
    -- Not a status change: the date is not the caller's to set.
    new.deactivated_at := old.deactivated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists assignees_stamp_deactivated_at on public.assignees;
create trigger assignees_stamp_deactivated_at
  before insert or update on public.assignees
  for each row execute function public.assignees_stamp_deactivated_at();
