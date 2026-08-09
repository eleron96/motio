-- assignees.color: the colour a person is drawn in — dashboard series, calendar
-- day-off circles, avatar monogram.
--
-- Why a column on assignees rather than profiles.preferences (where the
-- time-off motif lives, 0131): the colour must exist for people WITHOUT an
-- account (external contacts hold tasks and days off too), it is scoped to one
-- workspace so the same person can read differently in two of them, and it must
-- be readable by every teammate rather than being a private preference. Same
-- shape as projects.color / statuses.color / tags.color.
--
-- NULL means "not chosen" and keeps the current behaviour: the client falls back
-- to the automatic palette (position in the id-sorted list of people), so nothing
-- changes visually for a workspace that never opens the setting.
--
-- Writes go through set_assignee_color(), never through a table UPDATE:
--   * a workspace admin may recolour anyone;
--   * anybody may recolour THEMSELVES (assignees.user_id = auth.uid()),
--     including a viewer, who has no UPDATE on assignees at all.
-- An RLS policy cannot express that, because a policy grants the whole row: a
-- viewer allowed to update their own assignee row would also be able to rename
-- themselves and flip is_active. A SECURITY DEFINER function touching exactly one
-- column is the narrow version of that permission.
--
-- Idempotent and self-contained: an EXECUTED changeSet does not prove the object
-- exists (the 0008 email guard was missing on testing while marked as run), so the
-- column, the constraint, the function and its grants are each individually
-- guarded and safe to re-run on a half-applied database.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.set_assignee_color(uuid, text);
--   ALTER TABLE public.assignees DROP CONSTRAINT IF EXISTS assignees_color_format;
--   ALTER TABLE public.assignees DROP COLUMN IF EXISTS color;

alter table public.assignees
  add column if not exists color text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignees_color_format'
      and conrelid = 'public.assignees'::regclass
  ) then
    alter table public.assignees
      add constraint assignees_color_format
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

create or replace function public.set_assignee_color(
  p_assignee_id uuid,
  p_color text
)
returns void as $$
declare
  target_workspace_id uuid;
  target_user_id uuid;
begin
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Colour must be #rrggbb' using errcode = '22023';
  end if;

  select workspace_id, user_id
  into target_workspace_id, target_user_id
  from public.assignees
  where id = p_assignee_id;

  if target_workspace_id is null then
    raise exception 'Assignee % does not exist', p_assignee_id using errcode = 'P0002';
  end if;

  -- Reading the row above bypasses RLS (definer), so membership is checked here
  -- explicitly: without this, any authenticated user could recolour a stranger
  -- in a workspace they cannot even see.
  if not (
    public.is_workspace_admin(target_workspace_id)
    or (target_user_id is not null and target_user_id = auth.uid())
  ) then
    raise exception 'Not allowed to change this colour' using errcode = '42501';
  end if;

  update public.assignees
  set color = p_color
  where id = p_assignee_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.set_assignee_color(uuid, text) from public, anon;
grant execute on function public.set_assignee_color(uuid, text) to authenticated;
grant execute on function public.set_assignee_color(uuid, text) to service_role;
