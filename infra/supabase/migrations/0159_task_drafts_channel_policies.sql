-- Live drafts in an open task card: teammates see, semi-transparent, the
-- subtask or comment someone is typing. That text travels through a Realtime
-- Presence channel per task, `task-drafts:<task id>`. A draft is task content,
-- so the channel is private: Realtime asks these policies on realtime.messages
-- whether the connecting user may join (select) and publish (insert).
--
-- - Join and listen: members of the task's workspace. The task lookup runs
--   under the tasks RLS too, so a stranger never matches.
-- - Publish (share one's own draft): editors of that workspace.
-- - Any other topic stays closed: with RLS on and no matching policy, a
--   private channel is refused.
--
-- The CASE keeps the uuid cast behind the format check (AND has no evaluation
-- order in SQL) and lets the lookup use the tasks primary key.
--
-- realtime.messages belongs to the Realtime service, which creates it on its
-- first start. Where it doesn't exist yet (CI provisioning without Realtime),
-- the policies are skipped; install.sh waits for the table before migrating.

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found, task draft channel policies skipped';
    return;
  end if;
  -- Only its owner (supabase_realtime_admin) or a superuser may add policies.
  -- Test and prod migrate as supabase_admin; a plain dev role skips instead
  -- of failing the whole migration run.
  if not (
    (select rolsuper from pg_roles where rolname = current_user)
    or pg_has_role(current_user, (select tableowner from pg_tables where schemaname = 'realtime' and tablename = 'messages'), 'MEMBER')
  ) then
    raise notice 'no rights to add policies on realtime.messages, task draft channel policies skipped';
    return;
  end if;

  execute 'drop policy if exists "workspace members join task draft channels" on realtime.messages';
  execute $policy$
    create policy "workspace members join task draft channels" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension in ('presence', 'broadcast')
        and exists (
          select 1
          from public.tasks t
          where t.id = (
            case
              when realtime.topic() ~ '^task-drafts:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(realtime.topic(), ':', 2)::uuid
            end
          )
            and public.is_workspace_member(t.workspace_id)
        )
      )
  $policy$;

  execute 'drop policy if exists "workspace editors share task drafts" on realtime.messages';
  execute $policy$
    create policy "workspace editors share task drafts" on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension in ('presence', 'broadcast')
        and exists (
          select 1
          from public.tasks t
          where t.id = (
            case
              when realtime.topic() ~ '^task-drafts:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(realtime.topic(), ':', 2)::uuid
            end
          )
            and public.is_workspace_editor(t.workspace_id)
        )
      )
  $policy$;
end;
$$;
