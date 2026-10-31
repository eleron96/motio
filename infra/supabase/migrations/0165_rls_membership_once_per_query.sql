-- Read policies check workspace membership once per query, not once per row.
--
-- Every "workspace members can read …" policy was is_workspace_member(workspace_id):
-- a SECURITY DEFINER function with SET options, which the planner cannot inline,
-- called for every row the query looks at. On prod the timeline's main query
-- (one workspace, a ±3-month window, ~1900 tasks) took 83–89 ms under RLS
-- against ~1 ms without it, and the reconcile id list ~58 ms.
--
-- current_user_workspace_ids() returns the caller's workspaces; the policies
-- become `workspace_id in (select public.current_user_workspace_ids())`, an
-- uncorrelated subquery the planner evaluates once. Same meaning as before: a
-- row is readable iff the caller is a member of its workspace.
--
-- The function is SECURITY INVOKER: it reads workspace_members under that
-- table's own policy, which deliberately stays on is_workspace_member (switching
-- it would make the policy depend on itself). That check runs only over the
-- caller's few membership rows. For anon, auth.uid() is null and it returns
-- nothing, exactly like is_workspace_member did. Idempotent.

create or replace function public.current_user_workspace_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select wm.workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
$$;

comment on function public.current_user_workspace_ids() is
  'Workspaces the current user belongs to. Used by read policies as an uncorrelated '
  'subquery so membership is checked once per query, not per row (0165).';

alter policy "workspace members can read assignees" on public.assignees
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read customer_contacts" on public.customer_contacts
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read customers" on public.customers
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read member groups" on public.member_groups
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read milestones" on public.milestones
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read project_activity" on public.project_activity
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read project_members" on public.project_members
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read projects" on public.projects
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read statuses" on public.statuses
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read tags" on public.tags
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read task comments" on public.task_comments
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read task subtasks" on public.task_subtasks
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read task types" on public.task_types
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read tasks" on public.tasks
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read time off" on public.time_off
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read dashboards" on public.workspace_dashboards
  using (workspace_id in (select public.current_user_workspace_ids()));
alter policy "workspace members can read" on public.workspaces
  using (id in (select public.current_user_workspace_ids()));
