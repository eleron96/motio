-- Workload heatmap: each person's share of a full working day (0–100 %).
--
-- Used only with the server setting heatmap.personCapacity (Admin → Settings,
-- off by default): then the heatmap counts the team as the sum of these shares
-- instead of one per person — a coordinator at 0 % adds nothing to capacity, a
-- part-timer at 50 % counts half. With the setting off nobody reads the column
-- and the heatmap is exactly as before. Every row starts at 100 %.
--
-- Editors may write assignees (0001), but the share is a workspace admin's
-- call, like the heatmap's own capacity (workspaces.heatmap_capacity_per_person):
-- a trigger lets only an admin or the owner change it. Server-side writers
-- without a signed-in user (service_role, migrations) are not affected.
--
-- Idempotent.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS assignees_guard_capacity ON public.assignees;
--   DROP FUNCTION IF EXISTS public.assignees_guard_capacity();
--   ALTER TABLE public.assignees DROP COLUMN IF EXISTS capacity_percent;

alter table public.assignees
  add column if not exists capacity_percent smallint not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assignees_capacity_percent_check'
      and conrelid = 'public.assignees'::regclass
  ) then
    alter table public.assignees
      add constraint assignees_capacity_percent_check
      check (capacity_percent between 0 and 100);
  end if;
end $$;

create or replace function public.assignees_guard_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.capacity_percent is distinct from old.capacity_percent
    and auth.uid() is not null
    and not public.is_workspace_admin(new.workspace_id)
    and not exists (
      select 1 from public.workspaces
      where id = new.workspace_id
        and owner_id = auth.uid()
    )
  then
    raise exception 'Only a workspace admin can change a person''s share of the workload'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists assignees_guard_capacity on public.assignees;
create trigger assignees_guard_capacity
  before update of capacity_percent on public.assignees
  for each row execute function public.assignees_guard_capacity();
