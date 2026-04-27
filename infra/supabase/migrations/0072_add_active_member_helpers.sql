-- Helpers for filtering workspace members by lifecycle status.
-- Design decision (see account-deletion-plan.md): when a user enters
-- PENDING_DELETION we do NOT remove their workspace_members rows. They stay so
-- that existing RLS continues to grant historical visibility (comments, tasks)
-- and so FK integrity isn't churned. We filter them out of "active" lists via
-- this view / helper instead.
--
-- Existing RLS on profiles already restricts PENDING_DELETION / PURGED rows to
-- people who share a workspace_members row. No changes needed there.

create or replace function public.is_workspace_member_active(p_workspace_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and p.status = 'ACTIVE'
  );
$$ language sql stable security definer set search_path = public set row_security = off;

create or replace view public.v_active_workspace_members as
  select wm.workspace_id,
         wm.user_id,
         wm.role,
         wm.created_at
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
   where p.status = 'ACTIVE';

grant select on public.v_active_workspace_members to authenticated;

comment on view public.v_active_workspace_members is
  'Workspace members whose profile is still ACTIVE. Use this when rendering '
  '"members of workspace" UI. For historical joins (comments, activity) keep '
  'using public.workspace_members directly — PENDING_DELETION / PURGED rows '
  'are intentionally retained there for audit integrity.';
